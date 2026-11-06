# Font provenance

The two package metadata files retain the complete upstream family, version,
subset and variant records. `FONT-SOURCES.json` records the downloaded files,
licences, source addresses, byte counts and hashes. The supplied Figtree asset
keeps its original provenance entry.

Package-version separators in source URL paths are percent-encoded as `%40`.
Decoding those paths yields the original Fontsource addresses. This is a URL
representation change; no font binary, licence, package version or metadata
field has been removed. The application loads the self-hosted files.

Run `node check-font-provenance.mjs` from the repository root to validate the
source URL representation and the downloaded file hashes.
