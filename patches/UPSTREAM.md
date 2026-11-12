# Bug reports for cadmpeg

Drafts, not sent. Each matches one patch in this folder. Byte offsets are from the record start.

## F3D: manifest with a display name and `NA_OFFLINESAVE` is rejected

Patch: `f3d-manifest-offline-save-after-display-name.patch`

An f3z holds a member made in Fusion by importing a STEP file and inserting it as an XREF. The member's `Manifest.dat` (3-2-0-0) ends:

```
u8 0, LP-UTF16 "Raspberry Pi Zero 2 W with Textures.f3d ", LP-UTF16 "NA_OFFLINESAVE", EOF
```

`docs/formats/f3d.md` §1.1 allows `NA_OFFLINESAVE` only after `u8 1`. After `u8 0` the grammar requires a `urn:` lineage, so the member fails with `f3d/xref.member-undecoded` ("lineage URN: value is not a nonempty ASCII URN"), and the whole XREF is dropped.

Fix: accept `NA_OFFLINESAVE` in the lineage slot of the `u8 0` form, with no lineage suffix after it. Spec grammar line added; tests in `manifest/tests.rs`.

## F3D: two local component-occurrence forms are not decoded

Patch: `f3d-leading-flag-occurrence-forms.patch`

Symptom: `assembly.local-occurrence-path-pose-unresolved` ("N component-path carrier(s) name no unique expanded local occurrence"). `design_component_occurrences` is empty, there are no `product_definitions`, and component bodies stay at their component origin.

Both forms are the leading-flag occurrence (§3.1) with one difference each. The records are registered under the occurrence-placement type `CE2913AA-…`, and the primary index selects them.

1. A nonempty attribute list. Offset 40 holds count 3, then `GatedByParent` (bool), `ResolutionTime` (HString, empty), `SelfGated` (bool), encoded as in the attributed form. Every later field moves by the run length. The rest is unchanged, including the leading flag, the body, and the flag copy.
2. No leading identity flag. With an empty attribute list, the carrier GUID length (`24 00 00 00`) follows the ordinal at offset 50. The frame is 250 bytes, and the body's flag copy `1` is the only flag. These are only identity frames; the pose comes from the component-path carrier.

Fix: the leading-flag parser reads a counted attribute run at offset 40 and shifts later fields. When the byte at the flag position is neither 0 nor 1, it reads the frame as flagless and requires body flag `1`. `DesignLeadingFlagOccurrenceFrame` stores `attributes` and `flagless` (omitted from the wire form when empty or false, so existing goldens are unchanged), and the offset helpers use them. The attribute loop of the attributed parser became a shared helper. Spec, layout table (`attribute_count` has no fixed value now) and tests are updated.

## STEP export: solids have no names

Patch: `step-solid-names.patch`

`export.rs` writes every `MANIFOLD_SOLID_BREP`, `BREP_WITH_VOIDS` and `SHELL_BASED_SURFACE_MODEL` with name `''`, even when `Body::name` is set. Readers that name parts from the solid get unnamed parts.

Fix: write the body name as the item name. Test: `writer_names_each_solid_after_its_body_on_both_paths`. The STEP reader still does not read solid names into `Body::name`, so a round trip does not keep them.

## STEP export: root products are named `cadmpeg_model` or by their id

Patch: `step-root-named-after-input-file.patch`

`convert part.f3d -o part.step` writes `FILE_NAME('cadmpeg_model',…)` and names the model product `cadmpeg_model`, because the CLI never sets `StepWriteOptions::product_name`. A Fusion root component has no stored name, so with a second root occurrence (an XREF), the writer names it by its id key (a UUID).

Fix: `EncodeInput` gains `name: Option<&str>`. The transcoder sets it to the input file stem, and the STEP plan uses it in place of `product_name`. The writer also gives the model name to the root-occurrence definition that is the only unnamed one, also below the synthetic assembly product. Test: `writer_names_the_sole_unnamed_root_definition_and_takes_the_document_name`.

## F3D: XREF occurrence placement is not decoded

Patch: `f3d-xref-display-pose.patch`

Same file as the first report. After that fix, the member merges, but `xref.placement-undecoded` ("typed placement carrier Some(212) for roles [] … did not close under its generation grammar") puts it at the identity (`xref.placement-identity-assumed`). The member's geometry has a far-off origin, so the part lands about 1 m away.

The record (809 bytes) is the attributed legacy placement with the three-property block, plus u8 `0` and a 128-byte matrix after the ordinal. All later members move by 129 bytes, and the 220-byte matrix tail repeats the matrix. The matrix is an identity rotation with translation `(-16, 98, 0)` cm. That is the stale matrix that §1.4 allows. The pose Fusion exports is a different one. Because the members do not close, the role list is empty and the failure binds to no reference.

`OGS/DefaultScene/world` holds an untagged display pose for path `[root component, 212]`. It equals the occurrence transform in Fusion's own STEP export of the file. The other 8 display poses equal their decoded current poses.

Fix: (1) for an attributed frame with a valid 88-byte prefix whose members do not close, read the role from the final 92 bytes when they form the identity tail. (2) An undecoded root-level XREF placement in an XREF-only table takes the unique untagged display pose at `[root component, carrier]` and reports the new `xref.placement-display-pose` (Warning). Without that row the identity fallback stays. Spec and open item DR-248 updated; tests `leading_flag_attributed_placement_keeps_its_role_for_an_undecoded_carrier` and `xref/tests/display_pose.rs`.
