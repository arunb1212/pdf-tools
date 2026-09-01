import type { Locale } from "../i18n/ui";

export interface FaqItem {
  q: string;
  a: string;
}

export interface FeatureCard {
  icon: string;
  title: string;
  desc: string;
}

// FAQ for the home page and features page.
export const homeFaq: Record<Locale, FaqItem[]> = {
  en: [
    {
      q: "Are these PDF tools really free?",
      a: "Yes. Every tool is free to use with no sign-up, no watermarks, and no usage limits on the client-side tools.",
    },
    {
      q: "Is it true my files never leave my device?",
      a: "For all client-side tools, yes. The merge, split, lock, unlock, and conversion work happens entirely in your browser using libraries like pdf-lib, pdf.js, and jsPDF.",
    },
    {
      q: "Do I need to install anything?",
      a: "No. Everything runs in your web browser. There's no app to download and no account to create.",
    },
    {
      q: "Which tools use a server?",
      a: "Table extraction from complex PDFs (PDF to CSV) and OCR (JPG to CSV) may use a server fallback for reliability. The UI clearly labels when this happens, and files are never stored.",
    },
  ],
  de: [
    {
      q: "Sind diese PDF-Tools wirklich kostenlos?",
      a: "Ja. Jedes Tool ist kostenlos nutzbar — ohne Anmeldung, ohne Wasserzeichen und ohne Nutzungslimits bei den clientseitigen Tools.",
    },
    {
      q: "Stimmt es, dass meine Dateien mein Gerät nie verlassen?",
      a: "Bei allen clientseitigen Tools: ja. Zusammenfügen, Teilen, Sperren, Entsperren und Konvertieren passiert vollständig in deinem Browser mit Bibliotheken wie pdf-lib, pdf.js und jsPDF.",
    },
    {
      q: "Muss ich etwas installieren?",
      a: "Nein. Alles läuft in deinem Webbrowser. Es gibt keine App zum Herunterladen und kein Konto zum Erstellen.",
    },
    {
      q: "Welche Tools nutzen einen Server?",
      a: "Die Tabellenextraktion aus komplexen PDFs (PDF zu CSV) und OCR (JPG zu CSV) können für Zuverlässigkeit einen Server-Fallback nutzen. Die UI kennzeichnet dies klar, und Dateien werden nie gespeichert.",
    },
  ],
};

// FAQ for the features page.
export const featuresFaq: Record<Locale, FaqItem[]> = {
  en: [
    {
      q: "What makes PDF Tools different from iLovePDF or SmallPDF?",
      a: "Privacy-first processing. The core tools run entirely in your browser, so your files are never uploaded. We also have genuinely useful CSV↔PDF and table-extraction tools that the big suites overlook.",
    },
    {
      q: "Are there limits on file size or number of uses?",
      a: "No hard limits on the client-side tools. Very large files use more of your device's memory, but there's no account, no quota, and no paywall.",
    },
    {
      q: "Do you sell my data or show intrusive ads?",
      a: "No. We don't sell data, we don't require accounts, and the UI is deliberately clean — no pop-ups, no dark patterns, and one clear action per page.",
    },
    {
      q: "How do the CSV and OCR tools work?",
      a: "CSV to PDF is generated locally with jsPDF. PDF to CSV reads the text layer in your browser for simple tables. OCR runs with Tesseract.js for images and may fall back to a server that deletes files immediately.",
    },
  ],
  de: [
    {
      q: "Was unterscheidet PDF Tools von iLovePDF oder SmallPDF?",
      a: "Datenschutzorientierte Verarbeitung. Die Kern-Tools laufen vollständig in deinem Browser, sodass deine Dateien nie hochgeladen werden. Zudem bieten wir nützliche CSV↔PDF- und Tabellenextraktions-Tools, die die großen Suiten übersehen.",
    },
    {
      q: "Gibt es Grenzen bei Dateigröße oder Nutzungshäufigkeit?",
      a: "Keine harten Grenzen bei den clientseitigen Tools. Sehr große Dateien nutzen mehr Speicher deines Geräts, aber es gibt kein Konto, kein Kontingent und keine Bezahlschranke.",
    },
    {
      q: "Verkaufst du meine Daten oder zeigst du aufdringliche Werbung?",
      a: "Nein. Wir verkaufen keine Daten, verlangen keine Konten und die UI ist bewusst sauber — keine Pop-ups, keine Dark Patterns und eine klare Aktion pro Seite.",
    },
    {
      q: "Wie funktionieren die CSV- und OCR-Tools?",
      a: "CSV zu PDF wird lokal mit jsPDF erstellt. PDF zu CSV liest die Textebene in deinem Browser für einfache Tabellen. OCR läuft mit Tesseract.js für Bilder und kann auf einen Server zurückfallen, der Dateien sofort löscht.",
    },
  ],
};

// Feature cards for the features page.
export const features: Record<Locale, FeatureCard[]> = {
  en: [
    {
      icon: "lock",
      title: "Private by design",
      desc: "Files are processed locally in your browser. No uploads, no storage, no watermarks.",
    },
    {
      icon: "bolt",
      title: "Blazing fast",
      desc: "Static pages, lazy-loaded processing, and no server round-trips mean tools start instantly.",
    },
    {
      icon: "shield",
      title: "Client-side processing",
      desc: "Merge, split, convert, and more — all in your browser. Your documents stay on your device.",
    },
    {
      icon: "table",
      title: "CSV & table tools",
      desc: "Turn spreadsheets into PDFs and extract tables back out. A genuinely underserved niche.",
    },
    {
      icon: "pen",
      title: "Sign & annotate",
      desc: "Draw or type, add text, and place signatures — without ever uploading a file.",
    },
    {
      icon: "globe",
      title: "Multi-language & SEO-native",
      desc: "Every tool and every language is a real, indexable, fast-loading page — not a JS-gated app shell.",
    },
  ],
  de: [
    {
      icon: "lock",
      title: "Privat by Design",
      desc: "Dateien werden lokal in deinem Browser verarbeitet. Kein Upload, keine Speicherung, keine Wasserzeichen.",
    },
    {
      icon: "bolt",
      title: "Blitzschnell",
      desc: "Statische Seiten, nachgeladene Verarbeitung und keine Server-Roundtrips lassen Tools sofort starten.",
    },
    {
      icon: "shield",
      title: "Clientseitige Verarbeitung",
      desc: "Zusammenfügen, teilen, konvertieren und mehr — alles in deinem Browser. Deine Dokumente bleiben auf deinem Gerät.",
    },
    {
      icon: "table",
      title: "CSV- & Tabellen-Tools",
      desc: "Tabellenkalkulationen in PDFs umwandeln und Tabellen wieder extrahieren. Eine echte Nische, die oft übersehen wird.",
    },
    {
      icon: "pen",
      title: "Signieren & kommentieren",
      desc: "Zeichnen oder tippen, Text hinzufügen und Signaturen platzieren — ohne je eine Datei hochzuladen.",
    },
    {
      icon: "globe",
      title: "Mehrsprachig & SEO-nativ",
      desc: "Jedes Tool und jede Sprache ist eine echte, indexierbare, schnell ladende Seite — keine JS-verriegelte App-Hülle.",
    },
  ],
};
