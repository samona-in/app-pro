#!/usr/bin/env bash
set -Eeuo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APPS="$ROOT/apps"
GREEN='\033[0;32m'; CYAN='\033[0;36m'; YELLOW='\033[1;33m'; RESET='\033[0m'
info(){ printf "${CYAN}%s${RESET}\n" "$*"; }
ok(){ printf "${GREEN}%s${RESET}\n" "$*"; }
die(){ echo "Error: $*" >&2; exit 1; }
command -v python3 >/dev/null || die "Python 3 is required."
[[ -d "$APPS/pro" && -d "$APPS/customer" ]] || die "Place this script in the repository's scripts/ folder."
printf "\n"; info "SAMONA LOCAL AAB BUILDER"; printf "\n1) Pro\n2) Customer\n3) Both\n"
read -r -p "Choose [1-3]: " choice
case "$choice" in 1) SELECTED=(pro);; 2) SELECTED=(customer);; 3) SELECTED=(pro customer);; *) die "Invalid choice";; esac

for APP in "${SELECTED[@]}"; do
  APP_DIR="$APPS/$APP"; ANDROID="$APP_DIR/android"; GRADLE="$ANDROID/app/build.gradle"; ENV_FILE="$APP_DIR/.env"; PROPS="$ANDROID/key.properties"
  [[ -f "$GRADLE" ]] || die "Missing $GRADLE"
  [[ -f "$ENV_FILE" ]] || touch "$ENV_FILE"
  if [[ "$APP" == pro ]]; then
    LABEL="Samona Pro"; SOURCE="$APP_DIR/@naveenalla__samona-pro.jks"; TARGET="$ANDROID/app/samona-pro-upload.jks"
  else
    LABEL="Samona Customer"; SOURCE="$APP_DIR/@naveenalla__samona-customer.jks"; TARGET="$ANDROID/app/samona-customer-upload.jks"
  fi
  printf "\n"; info "Preparing $LABEL"
  API="$(python3 - "$ENV_FILE" <<'PY'
import re,sys
for line in open(sys.argv[1],encoding="utf-8"):
 m=re.match(r'^\s*(?:export\s+)?EXPO_PUBLIC_API_URL\s*=\s*(.*?)\s*$',line)
 if m: print(m.group(1).strip().strip('"').strip("'")); break
PY
)"
  printf "EXPO_PUBLIC_API_URL in %s: %s\n" "$ENV_FILE" "${API:-<not set>}"
  while true; do
    read -r -p "[1] Continue  [2] Edit URL  [q] Quit: " answer
    case "$answer" in
      1) [[ -n "$API" ]] || die "API URL missing; choose Edit."; break ;;
      2)
        read -r -p "Enter API URL: " API
        [[ -n "$API" ]] || { echo "URL cannot be empty."; continue; }
        python3 - "$ENV_FILE" "$API" <<'PY'
import re,sys
p,v=sys.argv[1:]; lines=open(p,encoding="utf-8").read().splitlines(); out=[]; found=False
for line in lines:
 if re.match(r'^\s*(?:export\s+)?EXPO_PUBLIC_API_URL\s*=',line):
  if not found: out.append("EXPO_PUBLIC_API_URL="+v); found=True
 else: out.append(line)
if not found: out.append("EXPO_PUBLIC_API_URL="+v)
open(p,"w",encoding="utf-8").write("\n".join(out)+"\n")
PY
        ok "Updated $ENV_FILE"; break ;;
      q|Q) exit 0 ;;
      *) echo "Choose 1, 2, or q." ;;
    esac
  done
  case "$API" in *localhost*|*127.0.0.1*|*0.0.0.0*)
    printf "${YELLOW}Warning: localhost URL is not suitable for Play Store users.${RESET}\n"
    read -r -p "Continue anyway? [y/N]: " confirm
    [[ "$confirm" == y || "$confirm" == Y ]] || die "Set AWS production URL first."
  esac

  if [[ -f "$SOURCE" ]]; then
    if [[ -f "$TARGET" ]]; then
      read -r -p "Target keystore exists. Replace it? [y/N]: " replace
      if [[ "$replace" == y || "$replace" == Y ]]; then mv -f "$SOURCE" "$TARGET"; ok "$(basename "$SOURCE") moved to android/app/$(basename "$TARGET")"
      else echo "Keeping target; source remains in place."; fi
    else mv "$SOURCE" "$TARGET"; ok "$(basename "$SOURCE") moved to android/app/$(basename "$TARGET")"; fi
  elif [[ -f "$TARGET" ]]; then ok "Keystore already present: android/app/$(basename "$TARGET")"
  else die "Keystore missing: expected $SOURCE or $TARGET"; fi

  if [[ ! -f "$PROPS" ]]; then
    echo "Enter the $LABEL EAS credentials (password input is hidden)."
    read -r -s -p "Store password: " STORE_PASS; echo
    read -r -p "Key alias: " KEY_ALIAS
    read -r -s -p "Key password: " KEY_PASS; echo
    [[ -n "$STORE_PASS" && -n "$KEY_ALIAS" && -n "$KEY_PASS" ]] || die "Signing credentials cannot be empty."
    printf 'storeFile=%s\nstorePassword=%s\nkeyAlias=%s\nkeyPassword=%s\n' "$(basename "$TARGET")" "$STORE_PASS" "$KEY_ALIAS" "$KEY_PASS" > "$PROPS"
    chmod 600 "$PROPS"; unset STORE_PASS KEY_ALIAS KEY_PASS
    ok "Created android/key.properties"
  else ok "Using existing android/key.properties"; fi

  touch "$ROOT/.gitignore"
  for pattern in "**/key.properties" "**/*.jks"; do grep -Fqx "$pattern" "$ROOT/.gitignore" || echo "$pattern" >> "$ROOT/.gitignore"; done

  python3 - "$GRADLE" <<'PY'
import re,sys
p=sys.argv[1]; s=open(p,encoding="utf-8").read()
def span(src,start):
 brace=src.find("{",start); depth=0; quote=None; esc=False
 if brace<0: raise SystemExit("Opening brace missing")
 for i in range(brace,len(src)):
  c=src[i]
  if quote:
   if esc: esc=False
   elif c=="\\": esc=True
   elif c==quote: quote=None
   continue
  if c in ("'",'"'): quote=c
  elif c=="{": depth+=1
  elif c=="}":
   depth-=1
   if depth==0: return start,i+1
 raise SystemExit("Unbalanced Gradle braces")
signing = '''signingConfigs {
        debug {
            storeFile file('debug.keystore')
            storePassword 'android'
            keyAlias 'androiddebugkey'
            keyPassword 'android'
        }
        release {
            def props = new Properties()
            def propsFile = rootProject.file('key.properties')
            if (!propsFile.exists()) {
                throw new GradleException("Missing android/key.properties")
            }
            propsFile.withInputStream { stream -> props.load(stream) }
            storeFile file(props['storeFile'])
            storePassword props['storePassword']
            keyAlias props['keyAlias']
            keyPassword props['keyPassword']
        }
    }'''
m=re.search(r'\bsigningConfigs\s*\{',s)
if m:
 a,b=span(s,m.start()); s=s[:a]+signing+s[b:]
else:
 m=re.search(r'\bbuildTypes\s*\{',s)
 if not m: raise SystemExit("buildTypes block not found")
 s=s[:m.start()]+signing+"\n\n    "+s[m.start():]
m=re.search(r'\bbuildTypes\s*\{',s)
if not m: raise SystemExit("buildTypes block not found")
a,b=span(s,m.start()); bt=s[a:b]
for kind in ("debug","release"):
 km=re.search(r'\b'+kind+r'\s*\{',bt)
 if not km: raise SystemExit(kind+" build type missing")
 x,y=span(bt,km.start()); sub=bt[x:y]
 sub,n=re.subn(r'\bsigningConfig\s+signingConfigs\.\w+',f'signingConfig signingConfigs.{kind}',sub,count=1)
 if not n: sub=sub[:sub.find("{")+1]+f"\n            signingConfig signingConfigs.{kind}"+sub[sub.find("{")+1:]
 bt=bt[:x]+sub+bt[y:]
s=s[:a]+bt+s[b:]
open(p,"w",encoding="utf-8").write(s)
print("Updated signingConfigs and debug/release signing.")
PY

  VERSION="$(python3 - "$GRADLE" <<'PY'
import re,sys
m=re.search(r'\bversionCode\s+(\d+)',open(sys.argv[1],encoding="utf-8").read())
print(m.group(1) if m else "")
PY
)"
  [[ -n "$VERSION" ]] || die "Could not find numeric versionCode in $GRADLE"
  echo "Current $LABEL versionCode: $VERSION"
  read -r -p "[1] Continue  [2] Edit versionCode: " vchoice
  if [[ "$vchoice" == 2 ]]; then
    read -r -p "New versionCode (must exceed Play Console's latest): " NEW
    [[ "$NEW" =~ ^[0-9]+$ ]] || die "versionCode must be an integer"
    python3 - "$GRADLE" "$NEW" <<'PY'
import re,sys
p,v=sys.argv[1:]; s=open(p,encoding="utf-8").read()
s,n=re.subn(r'(\bversionCode\s+)\d+',lambda m:m.group(1)+v,s,count=1)
if n!=1: raise SystemExit("versionCode update failed")
open(p,"w",encoding="utf-8").write(s)
PY
    VERSION="$NEW"
  elif [[ "$vchoice" != 1 ]]; then die "Invalid version choice"; fi

  printf "\n"; info "Building $LABEL (versionCode $VERSION)..."
  (cd "$ANDROID" && EXPO_PUBLIC_API_URL="$API" ./gradlew bundleRelease)
  AAB="$ANDROID/app/build/outputs/bundle/release/app-release.aab"
  [[ -f "$AAB" ]] || die "AAB not found: $AAB"
  WHEN="$(date '+%Y-%m-%d %H:%M:%S %Z')"
  printf "\n${GREEN}Congratulations! You have created a new .aab for %s.${RESET}\nPath: %s\nVersion code: %s\nTime: %s\n\n" "$LABEL" "$AAB" "$VERSION" "$WHEN"
done
ok "All selected builds completed."
