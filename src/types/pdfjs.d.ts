declare module "pdfjs-dist/build/pdf.mjs" {
  export const GlobalWorkerOptions: { workerSrc: string };
  export function getDocument(src: { data: ArrayBuffer | Uint8Array }): {
    promise: Promise<PDFDocumentProxy>;
  };
  export class PDFDocumentProxy {
    numPages: number;
    getPage(n: number): Promise<PDFPageProxy>;
  }
  export class PDFPageProxy {
    getViewport(scale: { scale: number }): { width: number; height: number };
    render(params: {
      canvasContext: CanvasRenderingContext2D;
      viewport: { width: number; height: number };
    }): { promise: Promise<void> };
    getTextContent(): Promise<{
      items: Array<{
        str: string;
        transform: number[];
        hasEOL?: boolean;
        width?: number;
      }>;
    }>;
  }
}

declare module "pdfjs-dist/build/pdf.worker.mjs" {
  const workerSrc: string;
  export default workerSrc;
}

declare module "pdfjs-dist/build/pdf.worker.mjs?url" {
  const workerUrl: string;
  export default workerUrl;
}

