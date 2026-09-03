export const locales = ["en", "de"] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = "en";

export function isLocale(value: string): value is Locale {
  return (locales as readonly string[]).includes(value);
}

function make(locale: Locale, entries: Record<string, string>) {
  return { locale, ...entries };
}

/**
 * Shared UI strings. Each locale is written natively (not machine-translated)
 * so every page reads naturally for its audience.
 */
export const ui = {
  en: make("en", {
    siteName: "PDF Tools",
    tagline: "Fast, private PDF tools that run right in your browser.",
    navHome: "Home",
    navTools: "Tools",
    navFeatures: "Features",
    navPrivacy: "Privacy",
    langLabel: "Language",
    langName: "English",
    featuresTitle: "Everything you need to work with PDFs",
    featuresSubtitle:
      "Fast, private, and free. Every tool runs right in your browser, so your files never leave your device.",
    featuresCta: "Try the tools",
    featuresHeroBadge: "Privacy-first PDF toolkit",
    featurePrivacyTitle: "Private by design",
    featurePrivacyDesc:
      "Files are processed locally in your browser. No uploads, no storage, no watermarks.",
    featureSpeedTitle: "Blazing fast",
    featureSpeedDesc:
      "Static pages, lazy-loaded processing, and no server round-trips mean tools start instantly.",
    featurePrivacyFiTitle: "Client-side processing",
    featurePrivacyFiDesc:
      "Merge, split, convert, and more — all in your browser. Your documents stay on your device.",
    featureTableFiTitle: "CSV & table tools",
    featureTableFiDesc:
      "Turn spreadsheets into PDFs and extract tables back out. A genuinely underserved niche.",
    featureSignFiTitle: "Sign & annotate",
    featureSignFiDesc:
      "Draw or type, add text, and place signatures — without ever uploading a file.",
    featureFaqHeading: "Frequently asked questions",
    featuresSectionTitle: "Features",
    featuresSubsectionTitle: "Why PDF Tools?",
    homeFaqHeading: "Frequently asked questions",
    homeFaqCta: "See all features",
    allTools: "All tools",
    heroTitle: "Do more with your PDFs — without uploading them.",
    heroSubtitle:
      "Merge, split, lock, unlock, and convert PDFs directly in your browser. No sign-up, no watermarks, and your files never leave your device.",
    heroCta: "Start with a tool",
    trustLine: "Your file never leaves your device.",
    processing: "Processing in your browser…",
    download: "Download",
    processAnother: "Process another file",
    chooseFiles: "Choose files",
    dragDrop: "Drag & drop your files here",
    or: "or",
    browse: "browse",
    noFiles: "No files selected yet.",
    errorGeneric: "Something went wrong. Please try again.",
    unsupportedFile: "That file type isn’t supported.",
    fullyClientSide: "Fully client-side — no upload.",
    serverFallback: "Uses a server fallback for complex files.",
    toolsSectionTitle: "All tools",
    clientSide: "Client-side",
    hybrid: "Hybrid",
    ocr: "OCR",
    footerDisclaimer:
      "PDF Tools processes files entirely in your browser. It is an independent toolkit and is not affiliated with Adobe.",
    footerLinks: "Tools",
    footerCompany: "Company",
    footerPrivacy: "Privacy policy",
    navAbout: "About",
    aboutTitle: "About PDF Tools",
    aboutIntro:
      "PDF Tools is an independent, privacy-first toolkit for working with PDFs. Every tool runs directly in your browser, so your files never leave your device.",
    aboutMissionTitle: "Our mission",
    aboutMission:
      "We believe document tools should be fast, free, and private. No accounts, no watermarks, no dark patterns — just one clear action per page.",
    aboutContactTitle: "Contact",
    aboutContact:
      "Questions, feedback, or a tool you'd like to see? We'd love to hear from you — email hello@pdf-tools.example.com.",
    notFoundTitle: "Page not found",
    notFoundBody: "The page you’re looking for doesn’t exist or has moved.",
    notFoundHome: "Go home",
    relatedTools: "More tools",
    howToTitle: "How to use",
    faqTitle: "Frequently asked questions",
    legalSignNote:
      "Disclaimer: any signature feature here is a simple electronic signing tool (draw/type/place). It is not a certified or legally-binding digital signature.",
    legalNote:
      "Disclaimer: this is a simple electronic signing tool (draw/type/place). It is not a certified or legally-binding digital signature.",
    ocrNote: "OCR runs in your browser. Complex tables can take a moment.",
    ocrNoteServer: "OCR runs on our secure server — your image is deleted instantly.",
    mergeAction: "Merge PDFs",
    splitAction: "Split PDF",
    lockAction: "Lock PDF",
    unlockAction: "Unlock PDF",
    pdfToJpgAction: "Convert to images",
    jpgToPdfAction: "Create PDF",
    pdfToCsvAction: "Extract table",
    csvToPdfAction: "Create PDF table",
    needTwoFiles: "Add at least one more PDF — merging needs 2 or more files.",
    errorPassword: "Incorrect password — please check it and try again.",
    errorNoText: "No readable text found. Scanned pages need OCR — try JPG to CSV instead.",
    passwordMismatch: "Passwords don’t match — please re-enter them.",
    passwordLabel: "Password",
    confirmPasswordLabel: "Confirm password",
    columnsLabel: "columns",
    rowsLabel: "rows",
    reorderHint: "Drag entries to reorder them.",
  }),
  de: make("de", {
    siteName: "PDF Tools",
    tagline: "Schnelle, private PDF-Tools, die direkt im Browser laufen.",
    navHome: "Start",
    navTools: "Tools",
    navFeatures: "Funktionen",
    navPrivacy: "Datenschutz",
    langLabel: "Sprache",
    langName: "Deutsch",
    featuresTitle: "Alles, was du für PDFs brauchst",
    featuresSubtitle:
      "Schnell, privat und kostenlos. Jedes Tool läuft direkt in deinem Browser, damit deine Dateien dein Gerät nie verlassen.",
    featuresCta: "Tools ausprobieren",
    featuresHeroBadge: "Datenschutzorientiertes PDF-Toolkit",
    featurePrivacyTitle: "Privat by Design",
    featurePrivacyDesc:
      "Dateien werden lokal in deinem Browser verarbeitet. Kein Upload, keine Speicherung, keine Wasserzeichen.",
    featureSpeedTitle: "Blitzschnell",
    featureSpeedDesc:
      "Statische Seiten, nachgeladene Verarbeitung und keine Server-Roundtrips lassen Tools sofort starten.",
    featurePrivacyFiTitle: "Clientseitige Verarbeitung",
    featurePrivacyFiDesc:
      "Zusammenfügen, teilen, konvertieren und mehr — alles in deinem Browser. Deine Dokumente bleiben auf deinem Gerät.",
    featureTableFiTitle: "CSV- & Tabellen-Tools",
    featureTableFiDesc:
      "Tabellenkalkulationen in PDFs umwandeln und Tabellen wieder extrahieren. Eine echte Nische, die oft übersehen wird.",
    featureSignFiTitle: "Signieren & kommentieren",
    featureSignFiDesc:
      "Zeichnen oder tippen, Text hinzufügen und Signaturen platzieren — ohne je eine Datei hochzuladen.",
    featureFaqHeading: "Häufige Fragen",
    featuresSectionTitle: "Funktionen",
    featuresSubsectionTitle: "Warum PDF Tools?",
    homeFaqHeading: "Häufige Fragen",
    homeFaqCta: "Alle Funktionen ansehen",
    allTools: "Alle Tools",
    heroTitle: "Mehr mit deinen PDFs machen — ganz ohne Hochladen.",
    heroSubtitle:
      "PDFs direkt im Browser zusammenfügen, teilen, sperren, entsperren und konvertieren. Keine Anmeldung, keine Wasserzeichen — deine Dateien verlassen dein Gerät nicht.",
    heroCta: "Mit einem Tool starten",
    trustLine: "Deine Datei verlässt dein Gerät nicht.",
    processing: "Wird in deinem Browser verarbeitet…",
    download: "Herunterladen",
    processAnother: "Weitere Datei verarbeiten",
    chooseFiles: "Dateien auswählen",
    dragDrop: "Dateien hierher ziehen & ablegen",
    or: "oder",
    browse: "durchsuchen",
    noFiles: "Noch keine Dateien ausgewählt.",
    errorGeneric: "Etwas ist schiefgelaufen. Bitte versuche es erneut.",
    unsupportedFile: "Dieser Dateityp wird nicht unterstützt.",
    fullyClientSide: "Vollständig clientseitig — kein Upload.",
    serverFallback: "Nutzt bei komplexen Dateien einen Server-Fallback.",
    toolsSectionTitle: "Alle Tools",
    clientSide: "Clientseitig",
    hybrid: "Hybrid",
    ocr: "OCR",
    footerDisclaimer:
      "PDF Tools verarbeitet Dateien vollständig in deinem Browser. Es ist ein unabhängiges Toolkit und steht nicht in Verbindung mit Adobe.",
    footerLinks: "Tools",
    footerCompany: "Unternehmen",
    footerPrivacy: "Datenschutzerklärung",
    navAbout: "Über uns",
    aboutTitle: "Über PDF Tools",
    aboutIntro:
      "PDF Tools ist ein unabhängiges, datenschutzorientiertes Toolkit für die Arbeit mit PDFs. Jedes Tool läuft direkt in deinem Browser, damit deine Dateien dein Gerät nie verlassen.",
    aboutMissionTitle: "Unsere Mission",
    aboutMission:
      "Wir glauben, dass Dokument-Tools schnell, kostenlos und privat sein sollten. Keine Konten, keine Wasserzeichen, keine Dark Patterns — nur eine klare Aktion pro Seite.",
    aboutContactTitle: "Kontakt",
    aboutContact:
      "Fragen, Feedback oder ein Tool, das du dir wünschst? Wir freuen uns auf dich — schreib an hallo@pdf-tools.example.com.",
    notFoundTitle: "Seite nicht gefunden",
    notFoundBody: "Die gesuchte Seite existiert nicht oder wurde verschoben.",
    notFoundHome: "Zur Startseite",
    relatedTools: "Weitere Tools",
    howToTitle: "So funktioniert’s",
    faqTitle: "Häufige Fragen",
    legalSignNote:
      "Hinweis: Eine etwaige Signaturfunktion ist ein einfaches elektronisches Signierwerkzeug (zeichnen/tippen/platzieren). Es ist keine zertifizierte oder rechtlich verbindliche digitale Signatur.",
    legalNote:
      "Hinweis: Dies ist ein einfaches elektronisches Signierwerkzeug (zeichnen/tippen/platzieren). Es ist keine zertifizierte oder rechtlich verbindliche digitale Signatur.",
    ocrNote: "Die OCR läuft in deinem Browser. Komplexe Tabellen können einen Moment dauern.",
    ocrNoteServer: "Die OCR läuft auf unserem sicheren Server — dein Bild wird sofort gelöscht.",
    mergeAction: "PDFs zusammenfügen",
    splitAction: "PDF teilen",
    lockAction: "PDF sperren",
    unlockAction: "PDF entsperren",
    pdfToJpgAction: "In Bilder umwandeln",
    jpgToPdfAction: "PDF erstellen",
    pdfToCsvAction: "Tabelle extrahieren",
    csvToPdfAction: "PDF-Tabelle erstellen",
    needTwoFiles: "Füge mindestens ein weiteres PDF hinzu — zum Zusammenfügen brauchst du 2 oder mehr Dateien.",
    errorPassword: "Falsches Passwort — bitte prüfe es und versuche es erneut.",
    errorNoText: "Kein lesbarer Text gefunden. Gescannte Seiten brauchen OCR — versuche stattdessen JPG zu CSV.",
    passwordMismatch: "Die Passwörter stimmen nicht überein — bitte erneut eingeben.",
    passwordLabel: "Passwort",
    confirmPasswordLabel: "Passwort bestätigen",
    columnsLabel: "Spalten",
    rowsLabel: "Zeilen",
    reorderHint: "Einträge per Drag & Drop sortieren.",
  }),
} as const;

export type UIStrings = (typeof ui)["en"];
export type UILocales = Record<Locale, UIStrings>;
