### Added

- Added reading notes with multiple notes per marked passage, editing, deletion, and local storage; deleting a note keeps the original mark, while removing a mark containing notes requires confirmation
- Added a Markdown note editor and formatting toolbar with live styling, supporting bold, italic, strikethrough, headings, blockquotes, inline code, code blocks, and links
- Added background highlights, underlines, and wavy underlines, available with the existing mark colors
- Added external EPUB import: Android supports opening or sharing EPUB files from other apps, including sharing multiple files; iOS supports opening EPUB files and importing them into the library

### Improved

- Improved the notes viewer with note counts, update timestamps, expandable long quotes, copying quoted text, and confirmation when leaving the editor with unsaved changes
- Improved reading progress navigation with live previews while dragging, preserving the requested progress until navigation completes, and fewer repeated navigation requests during consecutive adjustments
- Added step buttons for font size, horizontal margins, and line height, combined layout updates during consecutive taps, and improved the settings panel layout on narrow screens and with larger system fonts
- Added error notifications for reader loading failures, showing each occurrence once; successful EPUB imports now omit the success notification
- Improved Android APK compression settings and enabled code minification and resource shrinking for release builds
- Nightly now shares the Android package name with the release build, allowing installation over it while retaining the library, reading progress, and settings; Develop keeps a separate package name

### Fixed

- Fixed text hit data updates after page changes so text selection uses data from the current page
- Fixed selection rectangle merging for text and narrow punctuation on the same line, improving selection rendering and handle positions
