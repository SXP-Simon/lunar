### Added

- Added font management for importing and removing TTF and OTF fonts, searching built-in, imported, and system fonts, and selecting body and UI fonts separately
- Added a viewer for book illustrations, opened by double-tapping an image, with pinch zoom, panning, and double-tap zoom
- Added reading time tracking; the progress panel shows the current book's reading progress, today's reading time, and total reading time, with tracking controlled by reader visibility and app foreground state
- Added a reading settings screen with options to keep the screen awake, show the system clock and battery indicator, and turn pages with volume keys; volume up turns to the previous page and volume down turns to the next page
- Added a theme selection panel with light, dark, and system options
- Added an About screen displaying the app version
- Added draggable text selection handles and an option to remove existing highlights from the selection toolbar

### Improved

- Upgraded the reading engine to Rito 2.0.0 and updated its native rendering protocol; revised EPUB chapter loading, text rendering, font resource management, and paragraph caching to reduce repeated text processing and drawing preparation
- Improved page caching and image generation for curl animations, including front and back page rendering, while keeping the current page visible until the destination page is presented
- Improved velocity detection and activation thresholds for page-turn gestures
- Extended the pull-down gesture to add or remove a bookmark on the current page, with improved prompts and visual feedback
- Improved the progress panel layout and dark theme backgrounds and text presentation in the table of contents, bookmarks, and typography panels
- Font selections now return to the built-in font when an imported font in use is removed
- Updated the splash screen and app branding

### Fixed

- Fixed a reading session freeze after changing fonts by adjusting the sequencing of font resolution and layout updates
