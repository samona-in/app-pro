# Patches

`patch-package` applies these after `npm install` (see the root `postinstall` script).

## `@gorhom/bottom-sheet` — content mask collapses during a drag

`@gorhom/bottom-sheet@5.2.14` animates the `BottomSheetContent` clip-mask height
through Reanimated. On Reanimated 4 + Fabric (which this app uses) that layout
update can be committed late while the sheet itself follows the finger every
frame. Dragging a sheet down therefore makes the white panel shrink and reveal
the screen behind it before the sheet snaps closed.

The patch applies the already calculated mask height and padding directly while
a handle or content pan gesture is active, instead of re-animating them each
frame. It is the workaround proposed in the upstream issues:

- https://github.com/gorhom/react-native-bottom-sheet/issues/2702
- https://github.com/gorhom/react-native-bottom-sheet/issues/2716
- https://github.com/gorhom/react-native-bottom-sheet/pull/2727

Remove this patch (and the `patch-package` dependency) once a release includes
the fix upstream.
