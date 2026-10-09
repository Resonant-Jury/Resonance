# Third-party notices

Resonance's own code is under the [MIT License](LICENSE). This file lists the
third-party artwork the repository carries and the apps ship, with the notices
their licenses ask for. Libraries installed by npm, Swift Package Manager and
Gradle are not listed here: each package carries its own license.

## Fonts (SIL Open Font License 1.1)

The iOS and Android apps bundle these typefaces from `apps/shared/fonts/`
(built by `scripts/native/subset-fonts.py` from the files
`scripts/native/fetch-fonts.sh` downloads). The website uses the same families
but keeps no font files in this repository: next/font fetches the Google Fonts
at build time and serves them from the site, and the handwriting face loads from
jsDelivr.

| File | Typeface | Copyright | Reserved Font Name | Source | Changes |
| --- | --- | --- | --- | --- | --- |
| `PlayfairDisplay.ttf` | Playfair Display | Copyright 2017 The Playfair Display Project Authors (https://github.com/clauseggers/Playfair-Display) | "Playfair Display" | [google/fonts](https://github.com/google/fonts/tree/main/ofl/playfairdisplay) | none |
| `DMSans.ttf` | DM Sans | Copyright 2014 The DM Sans Project Authors (https://github.com/googlefonts/dm-fonts) | none | [google/fonts](https://github.com/google/fonts/tree/main/ofl/dmsans) | none |
| `NotoSansTC.ttf` | Noto Sans TC | (c) 2014-2021 Adobe (http://www.adobe.com/) | "Source" | [google/fonts](https://github.com/google/fonts/tree/main/ofl/notosanstc) | subset, hinting removed |
| `NotoSerifTC.ttf` | Noto Serif TC | (c) 2017-2024 Adobe (http://www.adobe.com/) | none | [google/fonts](https://github.com/google/fonts/tree/main/ofl/notoseriftc) | subset, hinting removed |
| `ChenYuluoyanThin.ttf` | ChenYuluoyan 2.0 Thin | Copyright (c) 2022, Wang, Li-Yu & Liu, Wei-Chen | "Chenyuluoyan" (the file's license record names a second one, left blank there) | [Chenyu-otf/chenyuluoyan_thin](https://github.com/Chenyu-otf/chenyuluoyan_thin) | subset, hinting removed |

"Subset" means the file keeps the Big5 symbols and level-1 characters (the 5,401
common ones), ASCII, Latin-1, general and CJK punctuation and the full-width forms;
every name record, the copyright and license ones included, is kept. "Playfair" is a trademark of Claus Eggers
Sørensen, "Noto" of Google Inc., "Source" of Adobe.

All five are licensed under the SIL Open Font License, Version 1.1:

```
Copyright (c) the copyright holders named in the table above.

This Font Software is licensed under the SIL Open Font License, Version 1.1.
This license is copied below, and is also available with a FAQ at:
https://openfontlicense.org


-----------------------------------------------------------
SIL OPEN FONT LICENSE Version 1.1 - 26 February 2007
-----------------------------------------------------------

PREAMBLE
The goals of the Open Font License (OFL) are to stimulate worldwide
development of collaborative font projects, to support the font creation
efforts of academic and linguistic communities, and to provide a free and
open framework in which fonts may be shared and improved in partnership
with others.

The OFL allows the licensed fonts to be used, studied, modified and
redistributed freely as long as they are not sold by themselves. The
fonts, including any derivative works, can be bundled, embedded,
redistributed and/or sold with any software provided that any reserved
names are not used by derivative works. The fonts and derivatives,
however, cannot be released under any other type of license. The
requirement for fonts to remain under this license does not apply
to any document created using the fonts or their derivatives.

DEFINITIONS
"Font Software" refers to the set of files released by the Copyright
Holder(s) under this license and clearly marked as such. This may
include source files, build scripts and documentation.

"Reserved Font Name" refers to any names specified as such after the
copyright statement(s).

"Original Version" refers to the collection of Font Software components as
distributed by the Copyright Holder(s).

"Modified Version" refers to any derivative made by adding to, deleting,
or substituting -- in part or in whole -- any of the components of the
Original Version, by changing formats or by porting the Font Software to a
new environment.

"Author" refers to any designer, engineer, programmer, technical
writer or other person who contributed to the Font Software.

PERMISSION & CONDITIONS
Permission is hereby granted, free of charge, to any person obtaining
a copy of the Font Software, to use, study, copy, merge, embed, modify,
redistribute, and sell modified and unmodified copies of the Font
Software, subject to the following conditions:

1) Neither the Font Software nor any of its individual components,
in Original or Modified Versions, may be sold by itself.

2) Original or Modified Versions of the Font Software may be bundled,
redistributed and/or sold with any software, provided that each copy
contains the above copyright notice and this license. These can be
included either as stand-alone text files, human-readable headers or
in the appropriate machine-readable metadata fields within text or
binary files as long as those fields can be easily viewed by the user.

3) No Modified Version of the Font Software may use the Reserved Font
Name(s) unless explicit written permission is granted by the corresponding
Copyright Holder. This restriction only applies to the primary font name as
presented to the users.

4) The name(s) of the Copyright Holder(s) and the Author(s) of the Font
Software shall not be used to promote, endorse or advertise any
Modified Version, except to acknowledge the contribution(s) of the
Copyright Holder(s) and the Author(s) or with their explicit written
permission.

5) The Font Software, modified or unmodified, in part or in whole,
must be distributed entirely under this license, and must not be
distributed under any other license. The requirement for fonts to
remain under this license does not apply to any document created
using the Font Software.

TERMINATION
This license becomes null and void if any of the above conditions are
not met.

DISCLAIMER
THE FONT SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO ANY WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT
OF COPYRIGHT, PATENT, TRADEMARK, OR OTHER RIGHT. IN NO EVENT SHALL THE
COPYRIGHT HOLDER BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY,
INCLUDING ANY GENERAL, SPECIAL, INDIRECT, INCIDENTAL, OR CONSEQUENTIAL
DAMAGES, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
FROM, OUT OF THE USE OR INABILITY TO USE THE FONT SOFTWARE OR FROM
OTHER DEALINGS IN THE FONT SOFTWARE.
```

## Flags (MIT)

The square flags in `public/flags/` (and the apps' flag pictures rendered from
them by `scripts/apps/flags.ts`) come from
[square-flags](https://github.com/kapowaz/square-flags):

```
MIT License

Copyright (c) 2023 Ben Darlow

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## Store badges (trademarks, not licensed)

`public/badges/` holds the official "Download on the App Store" and "Get it on
Google Play" badges, unmodified. They are not covered by this repository's
license. Apple, the Apple logo and App Store are trademarks of Apple Inc.,
registered in the U.S. and other countries and regions. Google Play and the
Google Play logo are trademarks of Google LLC. Each badge is used as its
owner's marketing guidelines allow: to link to Resonance's own store pages.
