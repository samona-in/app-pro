import type { ImageRequireSource } from 'react-native';
import aeFlag from '@/assets/images/flags/ae.png';
import auFlag from '@/assets/images/flags/au.png';
import bdFlag from '@/assets/images/flags/bd.png';
import bhFlag from '@/assets/images/flags/bh.png';
import brFlag from '@/assets/images/flags/br.png';
import caFlag from '@/assets/images/flags/ca.png';
import chFlag from '@/assets/images/flags/ch.png';
import cnFlag from '@/assets/images/flags/cn.png';
import deFlag from '@/assets/images/flags/de.png';
import egFlag from '@/assets/images/flags/eg.png';
import esFlag from '@/assets/images/flags/es.png';
import frFlag from '@/assets/images/flags/fr.png';
import gbFlag from '@/assets/images/flags/gb.png';
import idFlag from '@/assets/images/flags/id.png';
import inFlag from '@/assets/images/flags/in.png';
import itFlag from '@/assets/images/flags/it.png';
import jpFlag from '@/assets/images/flags/jp.png';
import keFlag from '@/assets/images/flags/ke.png';
import krFlag from '@/assets/images/flags/kr.png';
import kwFlag from '@/assets/images/flags/kw.png';
import lkFlag from '@/assets/images/flags/lk.png';
import mxFlag from '@/assets/images/flags/mx.png';
import mvFlag from '@/assets/images/flags/mv.png';
import myFlag from '@/assets/images/flags/my.png';
import ngFlag from '@/assets/images/flags/ng.png';
import nlFlag from '@/assets/images/flags/nl.png';
import npFlag from '@/assets/images/flags/np.png';
import nzFlag from '@/assets/images/flags/nz.png';
import omFlag from '@/assets/images/flags/om.png';
import pkFlag from '@/assets/images/flags/pk.png';
import phFlag from '@/assets/images/flags/ph.png';
import qaFlag from '@/assets/images/flags/qa.png';
import ruFlag from '@/assets/images/flags/ru.png';
import saFlag from '@/assets/images/flags/sa.png';
import sgFlag from '@/assets/images/flags/sg.png';
import thFlag from '@/assets/images/flags/th.png';
import trFlag from '@/assets/images/flags/tr.png';
import usFlag from '@/assets/images/flags/us.png';
import vnFlag from '@/assets/images/flags/vn.png';
import zaFlag from '@/assets/images/flags/za.png';

/**
 * Calling countries offered on the phone login.
 *
 * Entries are `[ISO 3166-1 alpha-2, name, dial code, longest local number]`;
 * the ISO code also keys the flag asset. India leads and is the default
 * market, the rest are ordered by where the audience actually is.
 */
const ENTRIES = [
  ['in', 'India', '91', 10],
  ['us', 'United States', '1', 10],
  ['gb', 'United Kingdom', '44', 10],
  ['ae', 'United Arab Emirates', '971', 9],
  ['sg', 'Singapore', '65', 8],
  ['sa', 'Saudi Arabia', '966', 9],
  ['ca', 'Canada', '1', 10],
  ['au', 'Australia', '61', 9],
  ['qa', 'Qatar', '974', 8],
  ['kw', 'Kuwait', '965', 8],
  ['om', 'Oman', '968', 8],
  ['bh', 'Bahrain', '973', 8],
  ['np', 'Nepal', '977', 10],
  ['lk', 'Sri Lanka', '94', 9],
  ['bd', 'Bangladesh', '880', 10],
  ['pk', 'Pakistan', '92', 10],
  ['my', 'Malaysia', '60', 10],
  ['mv', 'Maldives', '960', 7],
  ['de', 'Germany', '49', 11],
  ['fr', 'France', '33', 9],
  ['it', 'Italy', '39', 10],
  ['nl', 'Netherlands', '31', 9],
  ['es', 'Spain', '34', 9],
  ['ch', 'Switzerland', '41', 9],
  ['tr', 'Türkiye', '90', 10],
  ['cn', 'China', '86', 11],
  ['jp', 'Japan', '81', 10],
  ['kr', 'South Korea', '82', 10],
  ['id', 'Indonesia', '62', 12],
  ['th', 'Thailand', '66', 9],
  ['vn', 'Vietnam', '84', 9],
  ['ph', 'Philippines', '63', 10],
  ['nz', 'New Zealand', '64', 10],
  ['za', 'South Africa', '27', 9],
  ['ng', 'Nigeria', '234', 10],
  ['ke', 'Kenya', '254', 9],
  ['eg', 'Egypt', '20', 10],
  ['ru', 'Russia', '7', 10],
  ['br', 'Brazil', '55', 11],
  ['mx', 'Mexico', '52', 10],
] as const;

export type CountryIso = (typeof ENTRIES)[number][0];

/**
 * Flag artwork from flagcdn (80px wide PNGs). Real images rather than emoji:
 * flag emoji render as plain country letters on several Android builds.
 * `Record<CountryIso, …>` keeps the map and the entry list in lockstep, so a
 * missing flag is a compile error, not a blank box at runtime.
 */
const FLAGS: Record<CountryIso, ImageRequireSource> = {
  ae: aeFlag,
  au: auFlag,
  bd: bdFlag,
  bh: bhFlag,
  br: brFlag,
  ca: caFlag,
  ch: chFlag,
  cn: cnFlag,
  de: deFlag,
  eg: egFlag,
  es: esFlag,
  fr: frFlag,
  gb: gbFlag,
  id: idFlag,
  in: inFlag,
  it: itFlag,
  jp: jpFlag,
  ke: keFlag,
  kr: krFlag,
  kw: kwFlag,
  lk: lkFlag,
  mx: mxFlag,
  my: myFlag,
  mv: mvFlag,
  ng: ngFlag,
  nl: nlFlag,
  np: npFlag,
  nz: nzFlag,
  om: omFlag,
  pk: pkFlag,
  ph: phFlag,
  qa: qaFlag,
  ru: ruFlag,
  sa: saFlag,
  sg: sgFlag,
  th: thFlag,
  tr: trFlag,
  us: usFlag,
  vn: vnFlag,
  za: zaFlag,
};

export interface Country {
  /** ISO 3166-1 alpha-2 code; also keys the flag asset. */
  iso: CountryIso;
  /** Calling country, as shown in the picker list. */
  name: string;
  /** ITU dial code without the leading plus, e.g. '91'. */
  dial: string;
  /** Longest local number the input accepts, so typing can be capped. */
  maxLocalDigits: number;
  flag: ImageRequireSource;
}

export const COUNTRIES: readonly Country[] = ENTRIES.map(([iso, name, dial, maxLocalDigits]) => ({
  iso,
  name,
  dial,
  maxLocalDigits,
  flag: FLAGS[iso],
}));

const [defaultCountry] = COUNTRIES;
export const DEFAULT_COUNTRY: Country = defaultCountry!;
