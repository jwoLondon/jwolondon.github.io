# Changelog

All notable changes to software provided from here will be documented in this file. This excludes blog posts and other non-software related content.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and software release adhere to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.5] - 2026-10-04

- Updated to use citation.js 0.9.0. 
- Database errors no longer prevent citation aggregation when publication year and author list are identical for multiple publications. 
- Added more explanatory error messages when unknown citation is provided.


## [1.0.4] - 2025-08-05

 ### Enhancement

Added class `csl-author` to bibliography outputs for CSS styling of author names.

## [1.0.3] - 2025-08-04

 ### Fixed

- references.js: Improved citation tracking and BibTeX parsing; Uses imported stylesheet for references table

## [1.0.2] - 2025-08-04

_Internal test release._

## [1.0.1] - 2025-08-04

_Internal test release._

## [1.0.0] - 2025-08-03

### Added

- references.js: Initial bundled release of references.js with ESM and UMD builds.
