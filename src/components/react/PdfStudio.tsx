import React, { useCallback, useEffect, useRef, useState } from "react";
import { FileDropzone } from "./FileDropzone";
import { ProcessResult } from "./ProcessResult";
import { loadPdfLib, pdfBlob, type ToolMessages } from "@/lib/pdf";
import {
  DocumentIcon,
  ShieldLockIcon,
  SparklesIcon,
  PenToolIcon,
  EyeOffIcon,
  TextIcon,
  ImageIcon,
  CameraIcon,
  DownloadIcon,
  TrashIcon,
  PlusCircleIcon,
  CursorClickIcon,
  MoveIcon,
  CloseIcon,
  UndoIcon,
  RedoIcon,
  ZoomInIcon,
  ZoomOutIcon,
  RotateIcon,
  DeletePageIcon,
  HighlightIcon,
  ShapeIcon,
} from "./Icons";

interface Props {
  messages: ToolMessages;
  locale?: string;
}

export type AnnotationType = "redaction" | "text" | "signature" | "image" | "highlight" | "shape";

export interface BaseAnnotation {
  id: number;
  page: number; // 1-indexed
  x: number; // normalized [0..1]
  y: number; // normalized [0..1]
  width: number; // normalized [0..1]
  height: number; // normalized [0..1]
}

export interface RedactionAnnotation extends BaseAnnotation {
  type: "redaction";
  color: "black" | "white" | "slate";
  label?: string;
}

export interface TextAnnotation extends BaseAnnotation {
  type: "text";
  text: string;
  fontSize: number; // in pt
  color: string;
  fontFamily: string;
  isBold?: boolean;
}

export interface SignatureAnnotation extends BaseAnnotation {
  type: "signature";
  imageUrl: string;
  pngBytes?: Uint8Array;
}

export interface ImageAnnotation extends BaseAnnotation {
  type: "image";
  imageUrl: string;
  bytes?: Uint8Array;
  mimeType: string;
}

export interface HighlightAnnotation extends BaseAnnotation {
  type: "highlight";
  color: string;
}

export interface ShapeAnnotation extends BaseAnnotation {
  type: "shape";
  shapeType: "rectangle" | "circle" | "arrow" | "line";
  color: string;
  strokeWidth: number;
  fillColor?: string;
}

export type Annotation =
  | RedactionAnnotation
  | TextAnnotation
  | SignatureAnnotation
  | ImageAnnotation
  | HighlightAnnotation
  | ShapeAnnotation;

export type ActiveTool = "select" | "redact" | "text" | "sign" | "image" | "highlight" | "shape";

const DISPLAY_SCALE = 1.35;
const MIN_ZOOM = 0.5;
const MAX_ZOOM = 3;
const ZOOM_STEP = 0.25;

export default function PdfStudio({ messages, locale = "en" }: Props) {
  // Document state
  const [file, setFile] = useState<File | null>(null);
  const [rawPdfBytes, setRawPdfBytes] = useState<Uint8Array | null>(null);
  const [pdfDoc, setPdfDoc] = useState<any>(null);
  const [pageNum, setPageNum] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [pageThumbnails, setPageThumbnails] = useState<string[]>([]);

  // Zoom state
  const [zoom, setZoom] = useState(1);
  const [showThumbnails, setShowThumbnails] = useState(true);

  // Undo/Redo state
  const historyRef = useRef<Annotation[][]>([[]]);
  const historyIndexRef = useRef(0);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  // Active Tool Mode
  const [activeTool, setActiveTool] = useState<ActiveTool>("select");

  // All annotations across all pages
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);

  // Redaction Tool Settings
  const [redactColor, setRedactColor] = useState<"black" | "white" | "slate">("black");
  const [redactLabel, setRedactLabel] = useState<string>("");

  // Text Tool Settings
  const [textInput, setTextInput] = useState<string>("Sample Text");
  const [textColor, setTextColor] = useState<string>("#121111");
  const [textSize, setTextSize] = useState<number>(18);
  const [textFont, setTextFont] = useState<string>("Helvetica");

  // Signature Tool Settings
  const [sigMode, setSigMode] = useState<"draw" | "type" | "upload" | "camera">("draw");
  const [sigUrl, setSigUrl] = useState<string | null>(null);
  const [sigBytes, setSigBytes] = useState<Uint8Array | null>(null);
  const [typedSig, setTypedSig] = useState<string>("");
  const [typedSigFont, setTypedSigFont] = useState<string>("cursive");
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);

  // Image Tool state
  const [uploadedImageUrl, setUploadedImageUrl] = useState<string | null>(null);
  const [uploadedImageBytes, setUploadedImageBytes] = useState<Uint8Array | null>(null);
  const [uploadedImageMime, setUploadedImageMime] = useState<string>("image/png");

  // Highlight Tool state
  const [highlightColor, setHighlightColor] = useState<string>("#fef08a");

  // Shape Tool state
  const [shapeType, setShapeType] = useState<"rectangle" | "circle" | "arrow" | "line">("rectangle");
  const [shapeColor, setShapeColor] = useState<string>("#3b82f6");
  const [shapeStrokeWidth, setShapeStrokeWidth] = useState<number>(2);

  // Form Field Tool state
  const [formFieldType, setFormFieldType] = useState<"checkbox" | "text" | "radio" | "date">("checkbox");

  // Context menu state
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    annotationId: number;
  } | null>(null);

  // Watermark state
  const [watermarkText, setWatermarkText] = useState<string>("CONFIDENTIAL");
  const [watermarkColor, setWatermarkColor] = useState<string>("#ef4444");
  const [watermarkOpacity, setWatermarkOpacity] = useState<number>(0.3);
  const [watermarkFontSize, setWatermarkFontSize] = useState<number>(48);
  const [showWatermarkPanel, setShowWatermarkPanel] = useState(false);

  // Page numbering state
  const [pageNumberPosition, setPageNumberPosition] = useState<"bottom-center" | "bottom-left" | "bottom-right" | "top-center">("bottom-center");
  const [pageNumberFontSize, setPageNumberFontSize] = useState<number>(12);
  const [pageNumberColor, setPageNumberColor] = useState<string>("#666666");
  const [showPageNumberPanel, setShowPageNumberPanel] = useState(false);

  // Canvas drawing state (for dragging new redaction / text box on PDF)
  const [isDrawing, setIsDrawing] = useState(false);
  const [drawStart, setDrawStart] = useState<{ x: number; y: number } | null>(null);
  const [drawCurrent, setDrawCurrent] = useState<{ x: number; y: number } | null>(null);

  // Dragging / Moving existing annotation
  const [draggingId, setDraggingId] = useState<number | null>(null);

  // Export / Progress state
  const [state, setState] = useState<"idle" | "processing" | "done" | "error">("idle");
  const [doneLabel, setDoneLabel] = useState<string | null>(null);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [filename, setFilename] = useState("studio-edited.pdf");

  // Refs
  const pageCanvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const drawSigCanvasRef = useRef<HTMLCanvasElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const sigFileInputRef = useRef<HTMLInputElement>(null);
  const imageFileInputRef = useRef<HTMLInputElement>(null);
  const mergeFileInputRef = useRef<HTMLInputElement>(null);
  const nextId = useRef(1);

  const accept = "application/pdf,.pdf";

  // Undo/Redo functions
  const pushHistory = useCallback((newAnnotations: Annotation[]) => {
    const newHistory = historyRef.current.slice(0, historyIndexRef.current + 1);
    newHistory.push(newAnnotations);
    historyRef.current = newHistory;
    historyIndexRef.current = newHistory.length - 1;
    setCanUndo(historyIndexRef.current > 0);
    setCanRedo(false);
  }, []);

  const undo = useCallback(() => {
    if (historyIndexRef.current > 0) {
      historyIndexRef.current--;
      const prevState = historyRef.current[historyIndexRef.current];
      setAnnotations(prevState);
      setCanUndo(historyIndexRef.current > 0);
      setCanRedo(true);
      setSelectedId(null);
    }
  }, []);

  const redo = useCallback(() => {
    if (historyIndexRef.current < historyRef.current.length - 1) {
      historyIndexRef.current++;
      const nextState = historyRef.current[historyIndexRef.current];
      setAnnotations(nextState);
      setCanUndo(true);
      setCanRedo(historyIndexRef.current < historyRef.current.length - 1);
      setSelectedId(null);
    }
  }, []);

  // Zoom functions
  const zoomIn = useCallback(() => {
    setZoom(prev => Math.min(MAX_ZOOM, prev + ZOOM_STEP));
  }, []);

  const zoomOut = useCallback(() => {
    setZoom(prev => Math.max(MIN_ZOOM, prev - ZOOM_STEP));
  }, []);

  const resetZoom = useCallback(() => {
    setZoom(1);
  }, []);

  // Page thumbnail generation
  const generateThumbnails = useCallback(async (pdf: any) => {
    const thumbs: string[] = [];
    const pdfjs = await import("pdfjs-dist/build/pdf.mjs");
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const viewport = page.getViewport({ scale: 0.2 });
      const canvas = document.createElement("canvas");
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const ctx = canvas.getContext("2d")!;
      await page.render({ canvasContext: ctx, viewport }).promise;
      thumbs.push(canvas.toDataURL("image/jpeg", 0.7));
    }
    setPageThumbnails(thumbs);
  }, []);

  // Page operations
  const rotatePage = useCallback(async (degrees: 90 | 180 | 270) => {
    if (!rawPdfBytes) return;
    setState("processing");
    try {
      const { PDFDocument } = await loadPdfLib();
      const doc = await PDFDocument.load(rawPdfBytes.slice(), { ignoreEncryption: true });
      const page = doc.getPage(pageNum - 1);
      page.setRotation((page.getRotation().angle + degrees) % 360);
      const newBytes = await doc.save();
      setRawPdfBytes(newBytes);
      const pdfjs = await import("pdfjs-dist/build/pdf.mjs");
      const updatedPdf = await pdfjs.getDocument({ data: newBytes.buffer.slice(0) }).promise;
      setPdfDoc(updatedPdf);
      generateThumbnails(updatedPdf);
      setState("idle");
    } catch (err) {
      console.error("Rotate error:", err);
      setState("error");
    }
  }, [rawPdfBytes, pageNum, generateThumbnails]);

  const deletePage = useCallback(async () => {
    if (!rawPdfBytes || totalPages <= 1) return;
    setState("processing");
    try {
      const { PDFDocument } = await loadPdfLib();
      const doc = await PDFDocument.load(rawPdfBytes.slice(), { ignoreEncryption: true });
      doc.removePage(pageNum - 1);
      const newBytes = await doc.save();
      setRawPdfBytes(newBytes);
      const newTotal = totalPages - 1;
      setTotalPages(newTotal);
      setPageNum(prev => Math.min(prev, newTotal));
      // Remove annotations for deleted page and shift page numbers
      const newAnnotations = annotations
        .filter(a => a.page !== pageNum)
        .map(a => a.page > pageNum ? { ...a, page: a.page - 1 } : a);
      setAnnotations(newAnnotations);
      pushHistory(newAnnotations);
      const pdfjs = await import("pdfjs-dist/build/pdf.mjs");
      const updatedPdf = await pdfjs.getDocument({ data: newBytes.buffer.slice(0) }).promise;
      setPdfDoc(updatedPdf);
      generateThumbnails(updatedPdf);
      setState("idle");
    } catch (err) {
      console.error("Delete page error:", err);
      setState("error");
    }
  }, [rawPdfBytes, totalPages, pageNum, annotations, pushHistory, generateThumbnails]);

  // Handle Initial PDF Load
  async function handleFiles(incoming: File[]) {
    const f = incoming[0];
    if (!f || (f.type !== "application/pdf" && !f.name.toLowerCase().endsWith(".pdf"))) {
      setState("error");
      return;
    }
    setFile(f);
    setAnnotations([]);
    setSelectedId(null);
    setPageNum(1);
    setState("idle");
    setDoneLabel(null);
    if (downloadUrl) URL.revokeObjectURL(downloadUrl);
    setDownloadUrl(null);
    setZoom(1);
    // Reset undo/redo history
    historyRef.current = [[]];
    historyIndexRef.current = 0;
    setCanUndo(false);
    setCanRedo(false);

    try {
      const pdfjs = await import("pdfjs-dist/build/pdf.mjs");
      const workerUrl = await import("pdfjs-dist/build/pdf.worker.mjs?url");
      pdfjs.GlobalWorkerOptions.workerSrc = workerUrl.default;

      const data = await f.arrayBuffer();
      setRawPdfBytes(new Uint8Array(data.slice(0)));

      const pdf = await pdfjs.getDocument({ data }).promise;
      setPdfDoc(pdf);
      setTotalPages(pdf.numPages);
      setActiveTool("select");
      generateThumbnails(pdf);
    } catch (err) {
      console.error("Studio PDF load error:", err);
      setState("error");
    }
  }

  // Render Current PDF Page
  useEffect(() => {
    let active = true;
    async function renderPage() {
      if (!pdfDoc || !pageCanvasRef.current) return;
      try {
        const page = await pdfDoc.getPage(pageNum);
        const viewport = page.getViewport({ scale: DISPLAY_SCALE * zoom });
        const canvas = pageCanvasRef.current;
        if (!canvas || !active) return;
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const ctx = canvas.getContext("2d")!;
        await page.render({ canvasContext: ctx, viewport }).promise;
      } catch (err) {
        console.error("Studio render page error:", err);
      }
    }
    renderPage();
    return () => {
      active = false;
    };
  }, [pdfDoc, pageNum, zoom]);

  // --------------------------------------------------------------------------
  // In-Session Document Merging (Insert Pages from Another PDF)
  // --------------------------------------------------------------------------
  async function handleMergeIncomingPdf(e: React.ChangeEvent<HTMLInputElement>) {
    const newFile = e.target.files?.[0];
    if (!newFile || !rawPdfBytes) return;

    setState("processing");
    try {
      const { PDFDocument } = await loadPdfLib();
      const baseDoc = await PDFDocument.load(rawPdfBytes.slice(), { ignoreEncryption: true });
      const incomingBytes = new Uint8Array(await newFile.arrayBuffer());
      const incomingDoc = await PDFDocument.load(incomingBytes, { ignoreEncryption: true });

      const copiedPages = await baseDoc.copyPages(incomingDoc, incomingDoc.getPageIndices());
      copiedPages.forEach((p) => baseDoc.addPage(p));

      const mergedBytes = await baseDoc.save();
      setRawPdfBytes(mergedBytes);

      // Re-initialize PDF.js with updated bytes
      const pdfjs = await import("pdfjs-dist/build/pdf.mjs");
      const updatedPdf = await pdfjs.getDocument({ data: mergedBytes.buffer.slice(0) }).promise;
      setPdfDoc(updatedPdf);
      setTotalPages(updatedPdf.numPages);
      setState("idle");
    } catch (err) {
      console.error("In-session merge error:", err);
      setState("error");
    } finally {
      if (mergeFileInputRef.current) mergeFileInputRef.current.value = "";
    }
  }

  // --------------------------------------------------------------------------
  // Drawing / Placement Interactions on PDF Page
  // --------------------------------------------------------------------------
  function handleCanvasPointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    if (e.button !== 0) return;
    const canvas = pageCanvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const y = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));

    if (activeTool === "select") {
      setSelectedId(null);
      return;
    }

    if (activeTool === "redact") {
      canvas.setPointerCapture(e.pointerId);
      setIsDrawing(true);
      setDrawStart({ x, y });
      setDrawCurrent({ x, y });
      setSelectedId(null);
    } else if (activeTool === "text") {
      // Instant place text at clicked point
      const newId = nextId.current++;
      const newAnnotation: TextAnnotation = {
        id: newId,
        type: "text",
        page: pageNum,
        x: Math.min(0.85, x),
        y: Math.min(0.95, y),
        width: 0.35,
        height: 0.05,
        text: textInput || "Text",
        fontSize: textSize,
        color: textColor,
        fontFamily: textFont,
      };
      setAnnotations((prev) => [...prev, newAnnotation]);
      setSelectedId(newId);
    } else if (activeTool === "sign" && sigUrl) {
      // Place active signature at clicked point
      const newId = nextId.current++;
      const newAnnotation: SignatureAnnotation = {
        id: newId,
        type: "signature",
        page: pageNum,
        x: Math.max(0, x - 0.12),
        y: Math.max(0, y - 0.04),
        width: 0.25,
        height: 0.08,
        imageUrl: sigUrl,
        pngBytes: sigBytes || undefined,
      };
      setAnnotations((prev) => [...prev, newAnnotation]);
      setSelectedId(newId);
    } else if (activeTool === "image" && uploadedImageUrl) {
      // Place active uploaded image at clicked point
      const newId = nextId.current++;
      const newAnnotation: ImageAnnotation = {
        id: newId,
        type: "image",
        page: pageNum,
        x: Math.max(0, x - 0.15),
        y: Math.max(0, y - 0.1),
        width: 0.3,
        height: 0.2,
        imageUrl: uploadedImageUrl,
        bytes: uploadedImageBytes || undefined,
        mimeType: uploadedImageMime,
      };
      setAnnotations((prev) => {
        const next = [...prev, newAnnotation];
        pushHistory(next);
        return next;
      });
      setSelectedId(newId);
    } else if (activeTool === "highlight") {
      // Start drawing highlight
      canvas.setPointerCapture(e.pointerId);
      setIsDrawing(true);
      setDrawStart({ x, y });
      setDrawCurrent({ x, y });
      setSelectedId(null);
    } else if (activeTool === "shape") {
      // Start drawing shape
      canvas.setPointerCapture(e.pointerId);
      setIsDrawing(true);
      setDrawStart({ x, y });
      setDrawCurrent({ x, y });
      setSelectedId(null);
    } else if (activeTool === "form") {
      // Place form field at clicked point
      const newId = nextId.current++;
      const fieldSizes = {
        checkbox: { width: 0.03, height: 0.03 },
        text: { width: 0.25, height: 0.04 },
        radio: { width: 0.03, height: 0.03 },
        date: { width: 0.2, height: 0.04 },
      };
      const size = fieldSizes[formFieldType];
      const newAnnotation: ShapeAnnotation = {
        id: newId,
        type: "shape",
        page: pageNum,
        x: Math.max(0, x - size.width / 2),
        y: Math.max(0, y - size.height / 2),
        width: size.width,
        height: size.height,
        shapeType: formFieldType === "checkbox" ? "rectangle" : formFieldType === "radio" ? "circle" : "rectangle",
        color: "#121111",
        strokeWidth: 2,
        fillColor: "transparent",
      };
      setAnnotations((prev) => {
        const next = [...prev, newAnnotation];
        pushHistory(next);
        return next;
      });
      setSelectedId(newId);
    }
  }

  function handleCanvasPointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!isDrawing || !drawStart) return;
    const canvas = pageCanvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const y = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
    setDrawCurrent({ x, y });
  }

  function handleCanvasPointerUp(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!isDrawing || !drawStart) return;
    const canvas = pageCanvasRef.current;
    if (canvas) {
      try {
        canvas.releasePointerCapture(e.pointerId);
      } catch {}
    }

    const endX = drawCurrent ? drawCurrent.x : drawStart.x;
    const endY = drawCurrent ? drawCurrent.y : drawStart.y;

    const left = Math.min(drawStart.x, endX);
    const top = Math.min(drawStart.y, endY);
    let width = Math.abs(endX - drawStart.x);
    let height = Math.abs(endY - drawStart.y);

    if (width < 0.012 && height < 0.012) {
      width = activeTool === "highlight" ? 0.3 : 0.2;
      height = activeTool === "highlight" ? 0.04 : 0.15;
    }

    const boxX = Math.max(0, Math.min(1 - width, left));
    const boxY = Math.max(0, Math.min(1 - height, top));

    const newId = nextId.current++;

    if (activeTool === "redact") {
      const newRedaction: RedactionAnnotation = {
        id: newId,
        type: "redaction",
        page: pageNum,
        x: boxX,
        y: boxY,
        width,
        height,
        color: redactColor,
        label: redactLabel.trim() || undefined,
      };
      setAnnotations((prev) => {
        const next = [...prev, newRedaction];
        pushHistory(next);
        return next;
      });
    } else if (activeTool === "highlight") {
      const newHighlight: HighlightAnnotation = {
        id: newId,
        type: "highlight",
        page: pageNum,
        x: boxX,
        y: boxY,
        width,
        height,
        color: highlightColor,
      };
      setAnnotations((prev) => {
        const next = [...prev, newHighlight];
        pushHistory(next);
        return next;
      });
    } else if (activeTool === "shape") {
      const newShape: ShapeAnnotation = {
        id: newId,
        type: "shape",
        page: pageNum,
        x: boxX,
        y: boxY,
        width,
        height,
        shapeType,
        color: shapeColor,
        strokeWidth: shapeStrokeWidth,
        fillColor: "transparent",
      };
      setAnnotations((prev) => {
        const next = [...prev, newShape];
        pushHistory(next);
        return next;
      });
    }

    setSelectedId(newId);
    setIsDrawing(false);
    setDrawStart(null);
    setDrawCurrent(null);
  }

  // --------------------------------------------------------------------------
  // Annotation Moving & Resizing
  // --------------------------------------------------------------------------
  function handleAnnotationPointerDown(e: React.PointerEvent<HTMLDivElement>, ann: Annotation) {
    const target = e.target as HTMLElement;
    if (target.closest(".studio-item-delete") || target.closest(".studio-item-resize")) {
      return;
    }

    e.stopPropagation();
    setSelectedId(ann.id);
    setDraggingId(ann.id);

    const el = e.currentTarget;
    try {
      el.setPointerCapture(e.pointerId);
    } catch {}

    const canvas = pageCanvasRef.current;
    if (!canvas) return;
    const canvasRect = canvas.getBoundingClientRect();

    const startClientX = e.clientX;
    const startClientY = e.clientY;
    const initialX = ann.x;
    const initialY = ann.y;

    function onPointerMove(ev: PointerEvent) {
      const deltaX = (ev.clientX - startClientX) / canvasRect.width;
      const deltaY = (ev.clientY - startClientY) / canvasRect.height;

      const newX = Math.max(0, Math.min(1 - ann.width, initialX + deltaX));
      const newY = Math.max(0, Math.min(1 - ann.height, initialY + deltaY));

      setAnnotations((prev) =>
        prev.map((a) => (a.id === ann.id ? { ...a, x: newX, y: newY } : a))
      );
    }

    function onPointerUp(ev: PointerEvent) {
      try {
        el.releasePointerCapture(ev.pointerId);
      } catch {}
      el.removeEventListener("pointermove", onPointerMove);
      el.removeEventListener("pointerup", onPointerUp);
      setDraggingId(null);
    }

    el.addEventListener("pointermove", onPointerMove);
    el.addEventListener("pointerup", onPointerUp);
  }

  function handleResizePointerDown(e: React.PointerEvent<HTMLDivElement>, ann: Annotation) {
    e.stopPropagation();
    setSelectedId(ann.id);

    const handleEl = e.currentTarget;
    try {
      handleEl.setPointerCapture(e.pointerId);
    } catch {}

    const canvas = pageCanvasRef.current;
    if (!canvas) return;
    const canvasRect = canvas.getBoundingClientRect();

    const startClientX = e.clientX;
    const startClientY = e.clientY;
    const initialW = ann.width;
    const initialH = ann.height;

    function onResizeMove(ev: PointerEvent) {
      const deltaW = (ev.clientX - startClientX) / canvasRect.width;
      const deltaH = (ev.clientY - startClientY) / canvasRect.height;

      const newW = Math.max(0.02, Math.min(1 - ann.x, initialW + deltaW));
      const newH = Math.max(0.015, Math.min(1 - ann.y, initialH + deltaH));

      setAnnotations((prev) =>
        prev.map((a) => (a.id === ann.id ? { ...a, width: newW, height: newH } : a))
      );
    }

    function onResizeUp(ev: PointerEvent) {
      try {
        handleEl.releasePointerCapture(ev.pointerId);
      } catch {}
      handleEl.removeEventListener("pointermove", onResizeMove);
      handleEl.removeEventListener("pointerup", onResizeUp);
    }

    handleEl.addEventListener("pointermove", onResizeMove);
    handleEl.addEventListener("pointerup", onResizeUp);
  }

  function deleteAnnotation(id: number) {
    setAnnotations((prev) => {
      const next = prev.filter((a) => a.id !== id);
      pushHistory(next);
      return next;
    });
    if (selectedId === id) setSelectedId(null);
    setContextMenu(null);
  }

  // Duplicate annotation
  const duplicateAnnotation = useCallback((ann: Annotation) => {
    const newId = nextId.current++;
    const newAnnotation = {
      ...ann,
      id: newId,
      x: ann.x + 0.02,
      y: ann.y + 0.02,
    };
    setAnnotations((prev) => {
      const next = [...prev, newAnnotation];
      pushHistory(next);
      return next;
    });
    setSelectedId(newId);
  }, [pushHistory]);

  // Context menu handlers
  const handleContextMenu = useCallback((e: React.MouseEvent, ann: Annotation) => {
    e.preventDefault();
    e.stopPropagation();
    setSelectedId(ann.id);
    setContextMenu({ x: e.clientX, y: e.clientY, annotationId: ann.id });
  }, []);

  const closeContextMenu = useCallback(() => {
    setContextMenu(null);
  }, []);

  // --------------------------------------------------------------------------
  // Signature Creation Logic (Draw / Type / Upload / Camera)
  // --------------------------------------------------------------------------
  const isDrawingSig = useRef(false);

  function startDrawSig(e: React.PointerEvent<HTMLCanvasElement>) {
    isDrawingSig.current = true;
    const canvas = drawSigCanvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const ctx = canvas.getContext("2d")!;
    ctx.lineWidth = 3;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#121111";
    ctx.beginPath();
    ctx.moveTo(e.clientX - rect.left, e.clientY - rect.top);
  }

  function moveDrawSig(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!isDrawingSig.current) return;
    const canvas = drawSigCanvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const ctx = canvas.getContext("2d")!;
    ctx.lineTo(e.clientX - rect.left, e.clientY - rect.top);
    ctx.stroke();
  }

  function endDrawSig() {
    if (!isDrawingSig.current) return;
    isDrawingSig.current = false;
    const canvas = drawSigCanvasRef.current;
    if (!canvas) return;
    canvas.toBlob(async (blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      setSigUrl(url);
      setSigBytes(new Uint8Array(await blob.arrayBuffer()));
    }, "image/png");
  }

  function clearDrawSig() {
    const canvas = drawSigCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setSigUrl(null);
    setSigBytes(null);
  }

  function generateTypedSignature(name: string, font: string) {
    if (!name.trim()) return;
    const canvas = document.createElement("canvas");
    canvas.width = 600;
    canvas.height = 160;
    const ctx = canvas.getContext("2d")!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#121111";

    let fontSpec = "italic 48px 'Brush Script MT', cursive";
    if (font === "brush") fontSpec = "italic 44px 'Segoe Script', cursive";
    if (font === "serif") fontSpec = "italic 40px Georgia, serif";

    ctx.font = fontSpec;
    ctx.textBaseline = "middle";
    ctx.textAlign = "center";
    ctx.fillText(name, canvas.width / 2, canvas.height / 2);

    canvas.toBlob(async (blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      setSigUrl(url);
      setSigBytes(new Uint8Array(await blob.arrayBuffer()));
    }, "image/png");
  }

  // Handle image upload for stamping
  async function handleImageStampUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const imgFile = e.target.files?.[0];
    if (!imgFile) return;
    const mime = imgFile.type || "image/png";
    const bytes = new Uint8Array(await imgFile.arrayBuffer());
    const url = URL.createObjectURL(imgFile);
    setUploadedImageUrl(url);
    setUploadedImageBytes(bytes);
    setUploadedImageMime(mime);
    setActiveTool("image");
  }

  // --------------------------------------------------------------------------
  // Camera capture for signatures
  // --------------------------------------------------------------------------
  async function startCamera() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment", width: { ideal: 1280 } },
      });
      setCameraStream(stream);
      setCameraActive(true);
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch (err) {
      console.warn("Camera start failed:", err);
    }
  }

  function stopCamera() {
    if (cameraStream) {
      cameraStream.getTracks().forEach((track) => track.stop());
    }
    setCameraStream(null);
    setCameraActive(false);
  }

  function captureCameraSnapshot() {
    const video = videoRef.current;
    if (!video) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    // Extract dark ink on white paper
    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imgData.data;
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const brightness = 0.299 * r + 0.587 * g + 0.114 * b;
      if (brightness > 175) {
        data[i + 3] = 0; // make white transparent
      } else {
        data[i] = 18;
        data[i + 1] = 17;
        data[i + 2] = 17;
        data[i + 3] = 255;
      }
    }
    ctx.putImageData(imgData, 0, 0);

    canvas.toBlob(async (blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      setSigUrl(url);
      setSigBytes(new Uint8Array(await blob.arrayBuffer()));
      stopCamera();
    }, "image/png");
  }

  // --------------------------------------------------------------------------
  // Final Single-Click PDF Export (Bake Everything Client-Side)
  // --------------------------------------------------------------------------
  async function bakeStudioPdf() {
    if (!file || !rawPdfBytes) return;
    setState("processing");

    try {
      const { PDFDocument, rgb, StandardFonts, degrees } = await loadPdfLib();
      const doc = await PDFDocument.load(rawPdfBytes.slice(), { ignoreEncryption: true });
      const helveticaBold = await doc.embedFont(StandardFonts.HelveticaBold);
      const helvetica = await doc.embedFont(StandardFonts.Helvetica);
      const timesRoman = await doc.embedFont(StandardFonts.TimesRoman);
      const pages = doc.getPages();

      // Process annotations grouped by page
      for (const ann of annotations) {
        if (ann.page < 1 || ann.page > pages.length) continue;
        const page = pages[ann.page - 1];
        const { width: pWidth, height: pHeight } = page.getSize();

        const rectX = ann.x * pWidth;
        const rectW = ann.width * pWidth;
        const rectH = ann.height * pHeight;
        const rectY = pHeight - ann.y * pHeight - rectH;

        if (ann.type === "redaction") {
          let colorRgb = rgb(0, 0, 0);
          let textRgb = rgb(1, 1, 1);
          if (ann.color === "white") {
            colorRgb = rgb(1, 1, 1);
            textRgb = rgb(0.2, 0.2, 0.2);
          } else if (ann.color === "slate") {
            colorRgb = rgb(0.12, 0.16, 0.24);
            textRgb = rgb(0.9, 0.9, 0.9);
          }

          page.drawRectangle({
            x: Math.max(0, rectX),
            y: Math.max(0, rectY),
            width: Math.min(pWidth, rectW),
            height: Math.min(pHeight, rectH),
            color: colorRgb,
            opacity: 1,
          });

          if (ann.label && ann.label.trim()) {
            const labelText = ann.label.trim();
            let fontSize = Math.min(14, Math.max(5, rectH * 0.65));
            let textWidth = helveticaBold.widthOfTextAtSize(labelText, fontSize);

            if (textWidth > rectW * 0.92) {
              fontSize = Math.max(4, fontSize * ((rectW * 0.92) / textWidth));
              textWidth = helveticaBold.widthOfTextAtSize(labelText, fontSize);
            }

            const textHeight = fontSize * 0.75;
            page.drawText(labelText, {
              x: rectX + (rectW - textWidth) / 2,
              y: rectY + (rectH - textHeight) / 2,
              size: fontSize,
              font: helveticaBold,
              color: textRgb,
            });
          }
        } else if (ann.type === "text") {
          let fontObj = helvetica;
          if (ann.fontFamily === "TimesRoman") fontObj = timesRoman;

          // Parse hex color into RGB
          let r = 0,
            g = 0,
            b = 0;
          if (ann.color && ann.color.startsWith("#") && ann.color.length === 7) {
            r = parseInt(ann.color.slice(1, 3), 16) / 255;
            g = parseInt(ann.color.slice(3, 5), 16) / 255;
            b = parseInt(ann.color.slice(5, 7), 16) / 255;
          }

          page.drawText(ann.text, {
            x: rectX,
            y: rectY + rectH * 0.2,
            size: ann.fontSize || 16,
            font: fontObj,
            color: rgb(r, g, b),
          });
        } else if (ann.type === "signature" && ann.pngBytes) {
          try {
            const pngImage = await doc.embedPng(ann.pngBytes);
            page.drawImage(pngImage, {
              x: rectX,
              y: rectY,
              width: rectW,
              height: rectH,
            });
          } catch (err) {
            console.warn("Signature embedding error:", err);
          }
        } else if (ann.type === "image" && ann.bytes) {
          try {
            let embeddedImg;
            if (ann.mimeType.includes("jpeg") || ann.mimeType.includes("jpg")) {
              embeddedImg = await doc.embedJpg(ann.bytes);
            } else {
              embeddedImg = await doc.embedPng(ann.bytes);
            }
            page.drawImage(embeddedImg, {
              x: rectX,
              y: rectY,
              width: rectW,
              height: rectH,
            });
          } catch (err) {
            console.warn("Image embedding error:", err);
          }
        } else if (ann.type === "highlight") {
          // Parse highlight color
          let hr = 1, hg = 0.94, hb = 0.54;
          if (ann.color && ann.color.startsWith("#") && ann.color.length === 7) {
            hr = parseInt(ann.color.slice(1, 3), 16) / 255;
            hg = parseInt(ann.color.slice(3, 5), 16) / 255;
            hb = parseInt(ann.color.slice(5, 7), 16) / 255;
          }
          page.drawRectangle({
            x: Math.max(0, rectX),
            y: Math.max(0, rectY),
            width: Math.min(pWidth, rectW),
            height: Math.min(pHeight, rectH),
            color: rgb(hr, hg, hb),
            opacity: 0.4,
          });
        } else if (ann.type === "shape") {
          // Parse shape color
          let sr = 0.23, sg = 0.51, sb = 0.96;
          if (ann.color && ann.color.startsWith("#") && ann.color.length === 7) {
            sr = parseInt(ann.color.slice(1, 3), 16) / 255;
            sg = parseInt(ann.color.slice(3, 5), 16) / 255;
            sb = parseInt(ann.color.slice(5, 7), 16) / 255;
          }
          const strokeWidth = ann.strokeWidth || 2;
          if (ann.shapeType === "rectangle") {
            page.drawRectangle({
              x: Math.max(0, rectX),
              y: Math.max(0, rectY),
              width: Math.min(pWidth, rectW),
              height: Math.min(pHeight, rectH),
              borderColor: rgb(sr, sg, sb),
              borderWidth: strokeWidth,
            });
          } else if (ann.shapeType === "circle") {
            page.drawCircle({
              x: rectX + rectW / 2,
              y: rectY + rectH / 2,
              size: Math.min(rectW, rectH) / 2,
              borderColor: rgb(sr, sg, sb),
              borderWidth: strokeWidth,
            });
          } else if (ann.shapeType === "line" || ann.shapeType === "arrow") {
            page.drawLine({
              start: { x: rectX, y: rectY + rectH / 2 },
              end: { x: rectX + rectW, y: rectY + rectH / 2 },
              thickness: strokeWidth,
              color: rgb(sr, sg, sb),
            });
          }
        }
      }

      // Apply watermark to all pages
      if (showWatermarkPanel && watermarkText.trim()) {
        const { StandardFonts } = await loadPdfLib();
        const watermarkFont = await doc.embedFont(StandardFonts.HelveticaBold);
        const wr = parseInt(watermarkColor.slice(1, 3), 16) / 255;
        const wg = parseInt(watermarkColor.slice(3, 5), 16) / 255;
        const wb = parseInt(watermarkColor.slice(5, 7), 16) / 255;

        for (const page of pages) {
          const { width: pw, height: ph } = page.getSize();
          const textWidth = watermarkFont.widthOfTextAtSize(watermarkText, watermarkFontSize);
          // Center watermark diagonally
          const x = pw / 2 - textWidth / 2;
          const y = ph / 2;
          page.drawText(watermarkText, {
            x,
            y,
            size: watermarkFontSize,
            font: watermarkFont,
            color: rgb(wr, wg, wb),
            opacity: watermarkOpacity,
            rotate: degrees(45),
          });
        }
      }

      // Apply page numbers to all pages
      if (showPageNumberPanel) {
        const { StandardFonts } = await loadPdfLib();
        const pageNumFont = await doc.embedFont(StandardFonts.Helvetica);
        const pr = parseInt(pageNumberColor.slice(1, 3), 16) / 255;
        const pg = parseInt(pageNumberColor.slice(3, 5), 16) / 255;
        const pb = parseInt(pageNumberColor.slice(5, 7), 16) / 255;

        pages.forEach((page, index) => {
          const { width: pw, height: ph } = page.getSize();
          const pageNumStr = `${index + 1}`;
          const textWidth = pageNumFont.widthOfTextAtSize(pageNumStr, pageNumberFontSize);

          let x = pw / 2 - textWidth / 2;
          let y = 30;

          if (pageNumberPosition === "bottom-left") {
            x = 30;
            y = 30;
          } else if (pageNumberPosition === "bottom-right") {
            x = pw - textWidth - 30;
            y = 30;
          } else if (pageNumberPosition === "top-center") {
            x = pw / 2 - textWidth / 2;
            y = ph - 30;
          }

          page.drawText(pageNumStr, {
            x,
            y,
            size: pageNumberFontSize,
            font: pageNumFont,
            color: rgb(pr, pg, pb),
          });
        });
      }

      const savedBytes = await doc.save();
      const blob = pdfBlob(savedBytes);
      const url = URL.createObjectURL(blob);
      setDownloadUrl(url);
      setFilename(`edited-${file.name.replace(/\.pdf$/i, "")}.pdf`);
      setDoneLabel(
        `Applied ${annotations.length} edit${annotations.length !== 1 ? "s" : ""} across ${totalPages} page${totalPages !== 1 ? "s" : ""}.`
      );
      setState("done");
    } catch (err) {
      console.error("Studio bake error:", err);
      setState("error");
    }
  }

  function reset() {
    setFile(null);
    setRawPdfBytes(null);
    setPdfDoc(null);
    setAnnotations([]);
    setSelectedId(null);
    setPageNum(1);
    setTotalPages(0);
    setState("idle");
    setDoneLabel(null);
    if (downloadUrl) URL.revokeObjectURL(downloadUrl);
    setDownloadUrl(null);
  }

  const currentPageAnnotations = annotations.filter((a) => a.page === pageNum);
  const selectedAnnotation = annotations.find((a) => a.id === selectedId);

  // Active drawing preview box
  let drawingBox: { left: number; top: number; width: number; height: number } | null = null;
  if (isDrawing && drawStart && drawCurrent) {
    const left = Math.min(drawStart.x, drawCurrent.x) * 100;
    const top = Math.min(drawStart.y, drawCurrent.y) * 100;
    const width = Math.abs(drawCurrent.x - drawStart.x) * 100;
    const height = Math.abs(drawCurrent.y - drawStart.y) * 100;
    drawingBox = { left, top, width, height };
  }

  // Keyboard shortcuts
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // Ignore if typing in an input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      // Undo/Redo
      if ((e.ctrlKey || e.metaKey) && e.key === "z" && !e.shiftKey) {
        e.preventDefault();
        undo();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === "y" || (e.key === "z" && e.shiftKey))) {
        e.preventDefault();
        redo();
        return;
      }

      // Tool shortcuts
      switch (e.key.toLowerCase()) {
        case "v": setActiveTool("select"); break;
        case "r": setActiveTool("redact"); break;
        case "t": setActiveTool("text"); break;
        case "s": setActiveTool("sign"); break;
        case "i": setActiveTool("image"); break;
        case "h": setActiveTool("highlight"); break;
        case "d": setActiveTool("shape"); break;
        case "delete":
        case "backspace":
          if (selectedId) {
            e.preventDefault();
            deleteAnnotation(selectedId);
          }
          break;
        case "+":
        case "=":
          zoomIn();
          break;
        case "-":
          zoomOut();
          break;
        case "0":
          resetZoom();
          break;
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [undo, redo, selectedId, zoomIn, zoomOut, resetZoom]);

  return (
    <div className="tool studio-wrapper">
      <FileDropzone
        accept={accept}
        onFiles={handleFiles}
        busy={state === "processing"}
        messages={messages}
        hint="PDF"
      />

      {file && (
        <div className="studio-app">
          {/* ── TOP ACTION BAR ── */}
          <div className="studio-header-bar">
            <div className="studio-header-left">
              <DocumentIcon size={18} />
              <span className="studio-file-title" title={file.name}>
                {file.name}
              </span>
              <span className="studio-page-badge">
                Page {pageNum} of {totalPages}
              </span>
            </div>

            <div className="studio-header-center">
              {/* Page Navigation */}
              <button
                type="button"
                className="btn btn--secondary btn--sm"
                disabled={pageNum <= 1}
                onClick={() => {
                  setPageNum((p) => p - 1);
                  setSelectedId(null);
                }}
              >
                ‹ Prev
              </button>
              <button
                type="button"
                className="btn btn--secondary btn--sm"
                disabled={pageNum >= totalPages}
                onClick={() => {
                  setPageNum((p) => p + 1);
                  setSelectedId(null);
                }}
              >
                Next ›
              </button>

              {/* Divider */}
              <span className="studio-divider" />

              {/* Undo/Redo */}
              <button
                type="button"
                className="btn btn--secondary btn--sm"
                onClick={undo}
                disabled={!canUndo}
                title="Undo (Ctrl+Z)"
                style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem" }}
              >
                <UndoIcon size={14} />
              </button>
              <button
                type="button"
                className="btn btn--secondary btn--sm"
                onClick={redo}
                disabled={!canRedo}
                title="Redo (Ctrl+Y)"
                style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem" }}
              >
                <RedoIcon size={14} />
              </button>

              {/* Divider */}
              <span className="studio-divider" />

              {/* Zoom Controls */}
              <button
                type="button"
                className="btn btn--secondary btn--sm"
                onClick={zoomOut}
                disabled={zoom <= MIN_ZOOM}
                title="Zoom Out (-)"
              >
                <ZoomOutIcon size={14} />
              </button>
              <span className="studio-zoom-badge" onClick={resetZoom} title="Reset Zoom">
                {Math.round(zoom * 100)}%
              </span>
              <button
                type="button"
                className="btn btn--secondary btn--sm"
                onClick={zoomIn}
                disabled={zoom >= MAX_ZOOM}
                title="Zoom In (+)"
              >
                <ZoomInIcon size={14} />
              </button>

              {/* Divider */}
              <span className="studio-divider" />

              {/* Page Operations */}
              <button
                type="button"
                className="btn btn--secondary btn--sm"
                onClick={() => rotatePage(90)}
                title="Rotate Page 90°"
                style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem" }}
              >
                <RotateIcon size={14} />
              </button>
              <button
                type="button"
                className="btn btn--secondary btn--sm"
                onClick={deletePage}
                disabled={totalPages <= 1}
                title="Delete Current Page"
                style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem" }}
              >
                <DeletePageIcon size={14} />
              </button>
            </div>

            <div className="studio-header-right">
              {/* Toggle Thumbnails */}
              <button
                type="button"
                className={`btn btn--secondary btn--sm${showThumbnails ? " is-active" : ""}`}
                onClick={() => setShowThumbnails(!showThumbnails)}
                title="Toggle Page Thumbnails"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="7" height="7" />
                  <rect x="14" y="3" width="7" height="7" />
                  <rect x="3" y="14" width="7" height="7" />
                  <rect x="14" y="14" width="7" height="7" />
                </svg>
              </button>

              {/* Watermark Button */}
              <button
                type="button"
                className={`btn btn--secondary btn--sm${showWatermarkPanel ? " is-active" : ""}`}
                onClick={() => setShowWatermarkPanel(!showWatermarkPanel)}
                title="Add Watermark"
                style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem" }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                </svg>
              </button>

              {/* Page Numbering Button */}
              <button
                type="button"
                className={`btn btn--secondary btn--sm${showPageNumberPanel ? " is-active" : ""}`}
                onClick={() => setShowPageNumberPanel(!showPageNumberPanel)}
                title="Add Page Numbers"
                style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem" }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 19l3-3h13" />
                  <path d="M4 5l3 3h13" />
                  <path d="M14 12h3" />
                </svg>
              </button>

              {/* Insert / Merge PDF Button */}
              <input
                ref={mergeFileInputRef}
                type="file"
                accept="application/pdf"
                style={{ display: "none" }}
                onChange={handleMergeIncomingPdf}
              />
              <button
                type="button"
                className="btn btn--secondary btn--sm studio-merge-btn"
                onClick={() => mergeFileInputRef.current?.click()}
                title="Append another PDF document into this session"
                style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem" }}
              >
                <PlusCircleIcon size={15} />
                Merge PDF
              </button>

              {/* Download PDF Button */}
              <button
                type="button"
                className="btn btn--primary btn--sm studio-save-btn"
                disabled={state === "processing"}
                onClick={bakeStudioPdf}
                style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem" }}
              >
                <DownloadIcon size={15} />
                {state === "processing" ? messages.processing : "Export PDF"}
              </button>
            </div>
          </div>

          {/* Watermark Panel */}
          {showWatermarkPanel && (
            <div className="studio-document-panel">
              <div className="studio-document-panel__header">
                <span className="studio-document-panel__title">Watermark Settings</span>
                <button
                  type="button"
                  className="btn btn--ghost btn--sm"
                  onClick={() => setShowWatermarkPanel(false)}
                >
                  <CloseIcon size={14} />
                </button>
              </div>
              <div className="studio-options-row">
                <div className="studio-input-group">
                  <span className="studio-prop-label">Text:</span>
                  <input
                    type="text"
                    className="input studio-text-mini"
                    value={watermarkText}
                    onChange={(e) => setWatermarkText(e.target.value)}
                    placeholder="CONFIDENTIAL"
                  />
                </div>
                <div className="studio-input-group">
                  <span className="studio-prop-label">Color:</span>
                  <input
                    type="color"
                    className="studio-color-picker"
                    value={watermarkColor}
                    onChange={(e) => setWatermarkColor(e.target.value)}
                  />
                </div>
                <div className="studio-input-group">
                  <span className="studio-prop-label">Opacity:</span>
                  <input
                    type="range"
                    min={0.1}
                    max={0.8}
                    step={0.1}
                    value={watermarkOpacity}
                    onChange={(e) => setWatermarkOpacity(Number(e.target.value))}
                    style={{ width: "80px" }}
                  />
                  <span className="studio-range-value">{Math.round(watermarkOpacity * 100)}%</span>
                </div>
                <div className="studio-input-group">
                  <span className="studio-prop-label">Size:</span>
                  <input
                    type="number"
                    min={24}
                    max={120}
                    className="input studio-num-mini"
                    value={watermarkFontSize}
                    onChange={(e) => setWatermarkFontSize(Number(e.target.value))}
                  />
                </div>
              </div>
              <p className="studio-hint">Watermark will be applied diagonally across all pages on export.</p>
            </div>
          )}

          {/* Page Numbering Panel */}
          {showPageNumberPanel && (
            <div className="studio-document-panel">
              <div className="studio-document-panel__header">
                <span className="studio-document-panel__title">Page Numbering</span>
                <button
                  type="button"
                  className="btn btn--ghost btn--sm"
                  onClick={() => setShowPageNumberPanel(false)}
                >
                  <CloseIcon size={14} />
                </button>
              </div>
              <div className="studio-options-row">
                <div className="studio-input-group">
                  <span className="studio-prop-label">Position:</span>
                  <select
                    className="input studio-text-mini"
                    value={pageNumberPosition}
                    onChange={(e) => setPageNumberPosition(e.target.value as any)}
                  >
                    <option value="bottom-center">Bottom Center</option>
                    <option value="bottom-left">Bottom Left</option>
                    <option value="bottom-right">Bottom Right</option>
                    <option value="top-center">Top Center</option>
                  </select>
                </div>
                <div className="studio-input-group">
                  <span className="studio-prop-label">Color:</span>
                  <input
                    type="color"
                    className="studio-color-picker"
                    value={pageNumberColor}
                    onChange={(e) => setPageNumberColor(e.target.value)}
                  />
                </div>
                <div className="studio-input-group">
                  <span className="studio-prop-label">Font Size:</span>
                  <input
                    type="number"
                    min={8}
                    max={36}
                    className="input studio-num-mini"
                    value={pageNumberFontSize}
                    onChange={(e) => setPageNumberFontSize(Number(e.target.value))}
                  />
                </div>
              </div>
              <p className="studio-hint">Page numbers will be added to all pages on export.</p>
            </div>
          )}

          {/* ── MAIN WORKSPACE: Thumbnails + Canvas ── */}
          <div className="studio-workspace">
            {/* Page Thumbnail Sidebar */}
            {showThumbnails && pageThumbnails.length > 0 && (
              <div className="studio-thumbnails">
                {pageThumbnails.map((thumb, i) => (
                  <div
                    key={i}
                    className={`studio-thumbnail${pageNum === i + 1 ? " is-active" : ""}`}
                    onClick={() => {
                      setPageNum(i + 1);
                      setSelectedId(null);
                    }}
                  >
                    <img src={thumb} alt={`Page ${i + 1}`} />
                    <span className="studio-thumbnail__num">{i + 1}</span>
                  </div>
                ))}
              </div>
            )}

            {/* ── WORKSPACE TOOL RIBBON ── */}
            <div className="studio-main-content">
            <div className="studio-tools-nav" role="tablist">
              <button
                type="button"
                className={`studio-tool-tab ${activeTool === "select" ? "is-active" : ""}`}
                onClick={() => setActiveTool("select")}
                title="Select (V)"
                style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem" }}
              >
                <CursorClickIcon size={16} />
                Select
              </button>
              <button
                type="button"
                className={`studio-tool-tab ${activeTool === "redact" ? "is-active" : ""}`}
                onClick={() => setActiveTool("redact")}
                title="Redact (R)"
                style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem" }}
              >
                <EyeOffIcon size={16} />
                Redact
              </button>
              <button
                type="button"
                className={`studio-tool-tab ${activeTool === "highlight" ? "is-active" : ""}`}
                onClick={() => setActiveTool("highlight")}
                title="Highlight (H)"
                style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem" }}
              >
                <HighlightIcon size={16} />
                Highlight
              </button>
              <button
                type="button"
                className={`studio-tool-tab ${activeTool === "text" ? "is-active" : ""}`}
                onClick={() => setActiveTool("text")}
                title="Text (T)"
                style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem" }}
              >
                <TextIcon size={16} />
                Text
              </button>
              <button
                type="button"
                className={`studio-tool-tab ${activeTool === "shape" ? "is-active" : ""}`}
                onClick={() => setActiveTool("shape")}
                title="Shapes (D)"
                style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem" }}
              >
                <ShapeIcon size={16} />
                Shapes
              </button>
              <button
                type="button"
                className={`studio-tool-tab ${activeTool === "sign" ? "is-active" : ""}`}
                onClick={() => setActiveTool("sign")}
                title="Sign (S)"
                style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem" }}
              >
                <PenToolIcon size={16} />
                Sign
              </button>
              <button
                type="button"
                className={`studio-tool-tab ${activeTool === "image" ? "is-active" : ""}`}
                onClick={() => setActiveTool("image")}
                title="Image (I)"
                style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem" }}
              >
                <ImageIcon size={16} />
                Image
              </button>
            </div>

            {/* Contextual Properties Panel for Active Tool */}
            <div className="studio-sub-toolbar">
              {activeTool === "select" && (
                <div className="studio-options-row">
                  <span className="studio-hint">
                    Click and drag any annotation on the page to reposition or resize.
                  </span>
                  {selectedAnnotation && (
                    <button
                      type="button"
                      className="btn btn--secondary btn--sm studio-delete-active-btn"
                      onClick={() => deleteAnnotation(selectedAnnotation.id)}
                      style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem" }}
                    >
                      <TrashIcon size={14} />
                      Delete Selected
                    </button>
                  )}
                </div>
              )}

              {activeTool === "redact" && (
                <div className="studio-options-row">
                  <div className="studio-color-group">
                    <span className="studio-prop-label">Box Style:</span>
                    <button
                      type="button"
                      className={`studio-chip ${redactColor === "black" ? "is-active" : ""}`}
                      onClick={() => setRedactColor("black")}
                    >
                      Blackout
                    </button>
                    <button
                      type="button"
                      className={`studio-chip ${redactColor === "white" ? "is-active" : ""}`}
                      onClick={() => setRedactColor("white")}
                    >
                      Whiteout
                    </button>
                    <button
                      type="button"
                      className={`studio-chip ${redactColor === "slate" ? "is-active" : ""}`}
                      onClick={() => setRedactColor("slate")}
                    >
                      Dark Gray
                    </button>
                  </div>

                  <div className="studio-input-group">
                    <span className="studio-prop-label">Label:</span>
                    <input
                      type="text"
                      className="input studio-text-mini"
                      placeholder="e.g. [REDACTED]"
                      value={redactLabel}
                      onChange={(e) => setRedactLabel(e.target.value)}
                    />
                  </div>

                  <span className="studio-hint">
                    Drag a box on the document below to redact.
                  </span>
                </div>
              )}

              {activeTool === "sign" && (
                <div className="studio-sign-panel">
                  <div className="studio-sign-nav">
                    <button
                      type="button"
                      className={`studio-chip ${sigMode === "draw" ? "is-active" : ""}`}
                      onClick={() => setSigMode("draw")}
                      style={{ display: "inline-flex", alignItems: "center", gap: "0.3rem" }}
                    >
                      <PenToolIcon size={14} />
                      Draw
                    </button>
                    <button
                      type="button"
                      className={`studio-chip ${sigMode === "type" ? "is-active" : ""}`}
                      onClick={() => setSigMode("type")}
                      style={{ display: "inline-flex", alignItems: "center", gap: "0.3rem" }}
                    >
                      <TextIcon size={14} />
                      Type
                    </button>
                    <button
                      type="button"
                      className={`studio-chip ${sigMode === "upload" ? "is-active" : ""}`}
                      onClick={() => setSigMode("upload")}
                      style={{ display: "inline-flex", alignItems: "center", gap: "0.3rem" }}
                    >
                      <ImageIcon size={14} />
                      Upload
                    </button>
                    <button
                      type="button"
                      className={`studio-chip ${sigMode === "camera" ? "is-active" : ""}`}
                      onClick={() => {
                        setSigMode("camera");
                        startCamera();
                      }}
                      style={{ display: "inline-flex", alignItems: "center", gap: "0.3rem" }}
                    >
                      <CameraIcon size={14} />
                      Camera
                    </button>
                  </div>

                  {sigMode === "draw" && (
                    <div className="studio-sig-draw-row">
                      <canvas
                        ref={drawSigCanvasRef}
                        className="studio-sig-canvas"
                        width={360}
                        height={90}
                        onPointerDown={startDrawSig}
                        onPointerMove={moveDrawSig}
                        onPointerUp={endDrawSig}
                      />
                      <button type="button" className="btn btn--secondary btn--sm" onClick={clearDrawSig}>
                        Clear
                      </button>
                    </div>
                  )}

                  {sigMode === "type" && (
                    <div className="studio-sig-type-row">
                      <input
                        type="text"
                        className="input studio-text-mini"
                        placeholder="Type your name..."
                        value={typedSig}
                        onChange={(e) => {
                          setTypedSig(e.target.value);
                          generateTypedSignature(e.target.value, typedSigFont);
                        }}
                      />
                      <button
                        type="button"
                        className={`studio-chip ${typedSigFont === "cursive" ? "is-active" : ""}`}
                        onClick={() => {
                          setTypedSigFont("cursive");
                          generateTypedSignature(typedSig || "Signature", "cursive");
                        }}
                      >
                        Cursive
                      </button>
                      <button
                        type="button"
                        className={`studio-chip ${typedSigFont === "brush" ? "is-active" : ""}`}
                        onClick={() => {
                          setTypedSigFont("brush");
                          generateTypedSignature(typedSig || "Signature", "brush");
                        }}
                      >
                        Brush
                      </button>
                    </div>
                  )}

                  {sigMode === "upload" && (
                    <div className="studio-sig-upload-row">
                      <input
                        ref={sigFileInputRef}
                        type="file"
                        accept="image/*"
                        style={{ display: "none" }}
                        onChange={async (e) => {
                          const f = e.target.files?.[0];
                          if (!f) return;
                          const url = URL.createObjectURL(f);
                          setSigUrl(url);
                          setSigBytes(new Uint8Array(await f.arrayBuffer()));
                        }}
                      />
                      <button
                        type="button"
                        className="btn btn--secondary btn--sm"
                        onClick={() => sigFileInputRef.current?.click()}
                        style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem" }}
                      >
                        <ImageIcon size={14} />
                        Choose Signature Image
                      </button>
                    </div>
                  )}

                  {sigMode === "camera" && (
                    <div className="studio-sig-camera-row">
                      {cameraActive ? (
                        <>
                          <video ref={videoRef} autoPlay playsInline muted className="studio-camera-feed" />
                          <button
                            type="button"
                            className="btn btn--primary btn--sm"
                            onClick={captureCameraSnapshot}
                            style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem" }}
                          >
                            <CameraIcon size={14} />
                            Snapshot
                          </button>
                          <button type="button" className="btn btn--secondary btn--sm" onClick={stopCamera}>
                            Cancel
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          className="btn btn--secondary btn--sm"
                          onClick={startCamera}
                          style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem" }}
                        >
                          <CameraIcon size={14} />
                          Open Camera
                        </button>
                      )}
                    </div>
                  )}

                  {sigUrl && (
                    <div className="studio-active-sig-badge">
                      <img src={sigUrl} alt="Signature ready" />
                      <span>Ready! Click anywhere on page to place.</span>
                    </div>
                  )}
                </div>
              )}

              {activeTool === "text" && (
                <div className="studio-options-row">
                  <div className="studio-input-group">
                    <span className="studio-prop-label">Text:</span>
                    <input
                      type="text"
                      className="input studio-text-mini"
                      value={textInput}
                      onChange={(e) => setTextInput(e.target.value)}
                    />
                  </div>

                  <div className="studio-input-group">
                    <span className="studio-prop-label">Size:</span>
                    <input
                      type="number"
                      min={8}
                      max={72}
                      className="input studio-num-mini"
                      value={textSize}
                      onChange={(e) => setTextSize(Number(e.target.value))}
                    />
                  </div>

                  <div className="studio-input-group">
                    <span className="studio-prop-label">Color:</span>
                    <input
                      type="color"
                      className="studio-color-picker"
                      value={textColor}
                      onChange={(e) => setTextColor(e.target.value)}
                    />
                  </div>

                  <div className="studio-input-group" style={{ display: "flex", gap: "0.3rem" }}>
                    <span className="studio-prop-label">Form Presets:</span>
                    <button
                      type="button"
                      className="btn btn--secondary btn--sm"
                      onClick={() => setTextInput("✓")}
                      title="Insert Checkmark"
                      style={{ padding: "0.2rem 0.5rem", fontWeight: 700 }}
                    >
                      ✓
                    </button>
                    <button
                      type="button"
                      className="btn btn--secondary btn--sm"
                      onClick={() => setTextInput("✕")}
                      title="Insert Cross"
                      style={{ padding: "0.2rem 0.5rem", fontWeight: 700 }}
                    >
                      ✕
                    </button>
                    <button
                      type="button"
                      className="btn btn--secondary btn--sm"
                      onClick={() => setTextInput(new Date().toISOString().slice(0, 10))}
                      title="Insert Today's Date"
                      style={{ padding: "0.2rem 0.5rem", fontSize: "0.78rem" }}
                    >
                      Today
                    </button>
                  </div>

                  <span className="studio-hint">
                    Click anywhere on document to place text or form mark.
                  </span>
                </div>
              )}

              {activeTool === "image" && (
                <div className="studio-options-row">
                  <input
                    ref={imageFileInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    style={{ display: "none" }}
                    onChange={handleImageStampUpload}
                  />
                  <button
                    type="button"
                    className="btn btn--secondary btn--sm"
                    onClick={() => imageFileInputRef.current?.click()}
                    style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem" }}
                  >
                    <ImageIcon size={14} />
                    Upload Photo / Stamp
                  </button>

                  {uploadedImageUrl ? (
                    <div className="studio-active-stamp-badge">
                      <img src={uploadedImageUrl} alt="Uploaded" />
                      <span>Click anywhere on document to place stamp.</span>
                    </div>
                  ) : (
                    <span className="studio-hint">Select an image or stamp to insert.</span>
                  )}
                </div>
              )}

              {activeTool === "highlight" && (
                <div className="studio-options-row">
                  <div className="studio-color-group">
                    <span className="studio-prop-label">Color:</span>
                    <button
                      type="button"
                      className={`studio-color-swatch${highlightColor === "#fef08a" ? " is-active" : ""}`}
                      style={{ background: "#fef08a" }}
                      onClick={() => setHighlightColor("#fef08a")}
                      title="Yellow"
                    />
                    <button
                      type="button"
                      className={`studio-color-swatch${highlightColor === "#bbf7d0" ? " is-active" : ""}`}
                      style={{ background: "#bbf7d0" }}
                      onClick={() => setHighlightColor("#bbf7d0")}
                      title="Green"
                    />
                    <button
                      type="button"
                      className={`studio-color-swatch${highlightColor === "#bfdbfe" ? " is-active" : ""}`}
                      style={{ background: "#bfdbfe" }}
                      onClick={() => setHighlightColor("#bfdbfe")}
                      title="Blue"
                    />
                    <button
                      type="button"
                      className={`studio-color-swatch${highlightColor === "#fecaca" ? " is-active" : ""}`}
                      style={{ background: "#fecaca" }}
                      onClick={() => setHighlightColor("#fecaca")}
                      title="Pink"
                    />
                  </div>
                  <span className="studio-hint">Drag on document to highlight text.</span>
                </div>
              )}

              {activeTool === "shape" && (
                <div className="studio-options-row">
                  <div className="studio-color-group">
                    <span className="studio-prop-label">Shape:</span>
                    <button
                      type="button"
                      className={`studio-chip${shapeType === "rectangle" ? " is-active" : ""}`}
                      onClick={() => setShapeType("rectangle")}
                    >
                      Rectangle
                    </button>
                    <button
                      type="button"
                      className={`studio-chip${shapeType === "circle" ? " is-active" : ""}`}
                      onClick={() => setShapeType("circle")}
                    >
                      Circle
                    </button>
                    <button
                      type="button"
                      className={`studio-chip${shapeType === "line" ? " is-active" : ""}`}
                      onClick={() => setShapeType("line")}
                    >
                      Line
                    </button>
                    <button
                      type="button"
                      className={`studio-chip${shapeType === "arrow" ? " is-active" : ""}`}
                      onClick={() => setShapeType("arrow")}
                    >
                      Arrow
                    </button>
                  </div>
                  <div className="studio-input-group">
                    <span className="studio-prop-label">Color:</span>
                    <input
                      type="color"
                      className="studio-color-picker"
                      value={shapeColor}
                      onChange={(e) => setShapeColor(e.target.value)}
                    />
                  </div>
                  <div className="studio-input-group">
                    <span className="studio-prop-label">Width:</span>
                    <input
                      type="range"
                      min={1}
                      max={8}
                      value={shapeStrokeWidth}
                      onChange={(e) => setShapeStrokeWidth(Number(e.target.value))}
                      style={{ width: "60px" }}
                    />
                  </div>
                  <span className="studio-hint">Drag on document to draw shape.</span>
                </div>
              )}
            </div>
          </div>

          {/* ── LIVE INTERACTIVE DOCUMENT WORKSPACE ── */}
          <div className="studio-viewport-area">
            <div className="studio-canvas-container" ref={containerRef}>
              <canvas
                ref={pageCanvasRef}
                className="studio-pdf-canvas"
                onPointerDown={handleCanvasPointerDown}
                onPointerMove={handleCanvasPointerMove}
                onPointerUp={handleCanvasPointerUp}
                style={{
                  cursor:
                    activeTool === "redact"
                      ? "crosshair"
                      : activeTool === "text"
                      ? "text"
                      : activeTool === "sign" && sigUrl
                      ? "copy"
                      : activeTool === "image" && uploadedImageUrl
                      ? "copy"
                      : "default",
                }}
              />

              {/* Live drawing rectangle preview for redactions */}
              {drawingBox && (
                <div
                  className={`studio-drawing-box studio-box--${redactColor}`}
                  style={{
                    left: `${drawingBox.left}%`,
                    top: `${drawingBox.top}%`,
                    width: `${drawingBox.width}%`,
                    height: `${drawingBox.height}%`,
                  }}
                >
                  {redactLabel.trim() && (
                    <span className="studio-redact-label">{redactLabel.trim()}</span>
                  )}
                </div>
              )}

              {/* Render all annotations for current page */}
              {currentPageAnnotations.map((ann) => {
                const isSelected = selectedId === ann.id;
                const isDragging = draggingId === ann.id;

                // Determine annotation class
                let annClass = "studio-image-item";
                if (ann.type === "redaction") {
                  annClass = `studio-box--${ann.color}`;
                } else if (ann.type === "text") {
                  annClass = "studio-text-item";
                } else if (ann.type === "highlight") {
                  annClass = "studio-highlight-item";
                } else if (ann.type === "shape") {
                  annClass = "studio-shape-item";
                }

                return (
                  <div
                    key={ann.id}
                    className={`studio-annotation-item ${annClass} ${isSelected ? "is-selected" : ""} ${isDragging ? "is-dragging" : ""}`}
                    style={{
                      left: `${ann.x * 100}%`,
                      top: `${ann.y * 100}%`,
                      width: `${ann.width * 100}%`,
                      height: `${ann.height * 100}%`,
                    }}
                    onPointerDown={(e) => handleAnnotationPointerDown(e, ann)}
                    onContextMenu={(e) => handleContextMenu(e, ann)}
                  >
                    {/* Render content based on annotation type */}
                    {ann.type === "redaction" && (
                      <span className="studio-redact-label">{ann.label || ""}</span>
                    )}

                    {ann.type === "text" && (
                      <span
                        className="studio-live-text"
                        style={{
                          color: ann.color,
                          fontSize: `${ann.fontSize * 1.1}px`,
                          fontFamily: ann.fontFamily,
                        }}
                      >
                        {ann.text}
                      </span>
                    )}

                    {ann.type === "signature" && (
                      <img src={ann.imageUrl} alt="Signature" className="studio-overlay-img" />
                    )}

                    {ann.type === "image" && (
                      <img src={ann.imageUrl} alt="Stamp" className="studio-overlay-img" />
                    )}

                    {ann.type === "highlight" && (
                      <div
                        className="studio-highlight-overlay"
                        style={{ background: ann.color, opacity: 0.4 }}
                      />
                    )}

                    {ann.type === "shape" && (
                      <svg
                        className="studio-shape-svg"
                        viewBox="0 0 100 100"
                        preserveAspectRatio="none"
                        style={{ width: "100%", height: "100%" }}
                      >
                        {ann.shapeType === "rectangle" && (
                          <rect
                            x={ann.strokeWidth}
                            y={ann.strokeWidth}
                            width={100 - ann.strokeWidth * 2}
                            height={100 - ann.strokeWidth * 2}
                            fill="none"
                            stroke={ann.color}
                            strokeWidth={ann.strokeWidth}
                          />
                        )}
                        {ann.shapeType === "circle" && (
                          <circle
                            cx="50"
                            cy="50"
                            r={50 - ann.strokeWidth}
                            fill="none"
                            stroke={ann.color}
                            strokeWidth={ann.strokeWidth}
                          />
                        )}
                        {(ann.shapeType === "line" || ann.shapeType === "arrow") && (
                          <line
                            x1="5"
                            y1="50"
                            x2="95"
                            y2="50"
                            stroke={ann.color}
                            strokeWidth={ann.strokeWidth}
                          />
                        )}
                      </svg>
                    )}

                    {/* Delete cross button */}
                    <button
                      type="button"
                      className="studio-item-delete"
                      onPointerDown={(e) => {
                        e.stopPropagation();
                        deleteAnnotation(ann.id);
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteAnnotation(ann.id);
                      }}
                      title="Delete item"
                    >
                      ×
                    </button>

                    {/* Corner resize handle */}
                    <div
                      className="studio-item-resize"
                      onPointerDown={(e) => handleResizePointerDown(e, ann)}
                      title="Drag to resize"
                    />
                  </div>
                );
              })}
            </div>
          </div>
          </div>

          {/* Context Menu */}
          {contextMenu && (
            <div
              className="studio-context-menu"
              style={{
                position: "fixed",
                left: contextMenu.x,
                top: contextMenu.y,
                zIndex: 1000,
              }}
              onClick={closeContextMenu}
            >
              <button
                type="button"
                className="studio-context-menu__item"
                onClick={() => {
                  const ann = annotations.find(a => a.id === contextMenu.annotationId);
                  if (ann) duplicateAnnotation(ann);
                  closeContextMenu();
                }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                </svg>
                Duplicate
              </button>
              <button
                type="button"
                className="studio-context-menu__item studio-context-menu__item--danger"
                onClick={() => deleteAnnotation(contextMenu.annotationId)}
              >
                <TrashIcon size={14} />
                Delete
              </button>
            </div>
          )}

          {/* Click outside to close context menu */}
          {contextMenu && (
            <div
              className="studio-context-menu__overlay"
              onClick={closeContextMenu}
              style={{
                position: "fixed",
                inset: 0,
                zIndex: 999,
              }}
            />
          )}

          <p className="legal-note" style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <ShieldLockIcon size={16} />
            <span>
              <strong>All-in-One Local Processing:</strong> Redacting, signing, text editing, and page merging run 100% in your browser. No files or confidential data ever leave your computer.
            </span>
          </p>
        </div>
      )}

      {state === "done" && downloadUrl && (
        <ProcessResult
          messages={messages}
          state={state}
          doneLabel={doneLabel}
          onReset={reset}
        >
          <a className="btn btn--primary" href={downloadUrl} download={filename}>
            {messages.download}
          </a>
        </ProcessResult>
      )}

      {state === "error" && (
        <ProcessResult
          messages={messages}
          state={state}
          doneLabel={null}
          onReset={reset}
        />
      )}
    </div>
  );
}
