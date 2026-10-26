import React, { useEffect, useRef, useState } from 'react';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import {
  Check,
  ChefHat,
  Download,
  FileText,
  Image as ImageIcon,
  MessageCircle,
  Printer,
  Receipt,
  Wine,
  X,
} from 'lucide-react';
import {
  type AtelierOrderSpec,
  type BrandProfile,
  type CorporateConfig,
  type InternalDocType,
  type InvoiceItem,
  type NCFSequence,
  type OrderPaymentRecord,
  type TechnicalOrderSpec,
} from '../db/db';
import {
  buildDocumentHeaderMetadata,
  buildWhatsAppShareUrl,
} from '../services/fiscalService';
import { BrandLogo } from './BrandLogo';

export interface KitchenTicketBlock {
  station: 'COCINA' | 'BAR';
  tableName: string;
  zone: string;
  waiterName: string;
  guests: number;
  orderNumber: string;
  orderType?: 'SALON' | 'PARA_LLEVAR' | 'DELIVERY';
  createdAt: string;
  items: InvoiceItem[];
}

export interface PrintableDocumentData {
  isFiscal: boolean;
  brand: BrandProfile;
  corporate: CorporateConfig;
  ncfSequence?: NCFSequence;
  documentCode: string;
  modifiedNcf?: string;
  internalDocTitle?: InternalDocType;
  customTitle?: string;
  authorizationNo?: string;
  expirationDate?: string;
  clientName: string;
  clientRncOrCedula?: string;
  clientPhone?: string;
  createdAt: string;
  items: InvoiceItem[];
  subtotal: number;
  discountTotal?: number;
  promoCodeApplied?: string;
  separateLaborAndMaterials?: boolean;
  itbisAmount: number;
  legalTipAmount?: number;
  voluntaryTipAmount?: number;
  totalAmount: number;
  amountPaid: number;
  balanceDue: number;
  payments?: OrderPaymentRecord[];
  atelierSpec?: AtelierOrderSpec;
  techSpec?: TechnicalOrderSpec;
  notes?: string;
  defaultFormat?: 'A4' | 'THERMAL_80MM';
  isKitchenOrder?: boolean;
  autoPrint?: boolean;
  kitchenTickets?: KitchenTicketBlock[];
}

interface InvoicePrintModalProps {
  data: PrintableDocumentData | null;
  onClose: () => void;
}

const COURSE_LABELS: Record<
  NonNullable<InvoiceItem['course']>,
  string
> = {
  ENTRADA: '1er Tiempo • Entrada',
  FUERTE: '2do Tiempo • Plato Fuerte',
  POSTRE: '3er Tiempo • Postre',
  BEBIDA: 'Bebida / Bar',
};

export const InvoicePrintModal: React.FC<InvoicePrintModalProps> = ({
  data,
  onClose,
}) => {
  const isMobileScreen =
    typeof window !== 'undefined' && window.innerWidth < 640;

  const [format, setFormat] = useState<'A4' | 'THERMAL_80MM'>(
    data?.isKitchenOrder
      ? 'THERMAL_80MM'
      : isMobileScreen
      ? 'THERMAL_80MM'
      : data?.defaultFormat || 'A4'
  );
  const [stationFilter, setStationFilter] = useState<'ALL' | 'COCINA' | 'BAR'>(
    'ALL'
  );
  const [isExporting, setIsExporting] = useState<boolean>(false);
  const [shareToast, setShareToast] = useState<string | null>(null);
  const printableRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (data) {
      const mobileNow =
        typeof window !== 'undefined' && window.innerWidth < 640;
      setFormat(
        data.isKitchenOrder
          ? 'THERMAL_80MM'
          : mobileNow
          ? 'THERMAL_80MM'
          : data.defaultFormat || 'A4'
      );
      setStationFilter('ALL');
      if (data.autoPrint) {
        const timer = setTimeout(() => {
          window.print();
        }, 250);
        return () => clearTimeout(timer);
      }
    }
  }, [data]);

  if (!data) return null;

  const header = buildDocumentHeaderMetadata({
    isFiscal: data.isFiscal,
    brand: data.brand,
    corporate: data.corporate,
    ncfSequence: data.ncfSequence,
    consumedCode: data.documentCode,
    internalDocTitle: data.internalDocTitle,
  });

  const displayTitle = data.customTitle || header.documentTitle;
  const effectiveAuthNo = data.authorizationNo || header.authorizationNo;
  const effectiveExpDate = data.expirationDate || header.expirationDate;

  const isPreCuenta =
    data.documentCode.startsWith('PRE-') ||
    (data.customTitle && data.customTitle.toUpperCase().includes('PRE-CUENTA'));

  // Cálculo de subtotales separados de Mano de Obra vs Materiales cuando está activo
  const laborSubtotal = data.items
    .filter((i) => !i.isCourtesy && i.costType === 'MANO_DE_OBRA')
    .reduce((acc, i) => {
      const ex = (i.extras || []).reduce((s, e) => s + e.price, 0);
      return acc + Math.max(0, i.quantity * (i.unitPrice + ex) - (i.discount || 0));
    }, 0);

  const materialsSubtotal = data.items
    .filter((i) => !i.isCourtesy && i.costType === 'MATERIALES')
    .reduce((acc, i) => {
      const ex = (i.extras || []).reduce((s, e) => s + e.price, 0);
      return acc + Math.max(0, i.quantity * (i.unitPrice + ex) - (i.discount || 0));
    }, 0);

  const whatsappUrl = buildWhatsAppShareUrl({
    phone: data.clientPhone || data.brand.phone,
    brandName: header.brandName,
    documentTitle: displayTitle,
    documentCode: header.documentNumber,
    clientName: data.clientName,
    itemsSummary: data.items.map(
      (i) =>
        `${i.quantity}x ${i.description}${i.notes ? ` (${i.notes})` : ''} (RD$ ${(
          i.quantity * i.unitPrice -
          (i.discount || 0)
        ).toLocaleString('es-DO', { minimumFractionDigits: 2 })})`
    ),
    totalAmount: data.totalAmount,
    amountPaid: data.amountPaid,
    balanceDue: data.balanceDue,
  });

  const formattedDate = new Date(data.createdAt).toLocaleDateString('es-DO', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });

  const triggerToast = (msg: string) => {
    setShareToast(msg);
    setTimeout(() => {
      setShareToast((prev) => (prev === msg ? null : prev));
    }, 5500);
  };

  /**
   * Pre-renderiza cada <img> y <svg> hacia un HTMLCanvasElement a escala 3x ANTES de llamar a html2canvas,
   * y dentro de onclone reemplaza cada nodo por un <canvas> síncrono con drawImage(sourceCanvas, 0, 0).
   */
  const capturePrintableCanvas = async (): Promise<HTMLCanvasElement> => {
    if (document.fonts && document.fonts.ready) {
      await document.fonts.ready;
    }

    const element = printableRef.current;
    if (!element) {
      throw new Error('Elemento de impresión no encontrado.');
    }

    const scaleFactor = 3;

    // 1. Pre-renderizar todas las etiquetas <img> vivas a HTMLCanvasElement a escala 3x con fondo blanco puro
    const liveImages = Array.from(element.querySelectorAll('img'));
    const imgCanvasMap = new Map<
      number,
      { canvas: HTMLCanvasElement; cssWidth: number; cssHeight: number }
    >();

    await Promise.all(
      liveImages.map(async (img, idx) => {
        try {
          if (!img.complete) {
            await new Promise<void>((resolve) => {
              img.onload = () => resolve();
              img.onerror = () => resolve();
            });
          }
          if (typeof img.decode === 'function') {
            await img.decode().catch(() => {});
          }

          const rect = img.getBoundingClientRect();
          const cssW =
            Number(img.getAttribute('width')) || Math.round(rect.width) || 210;
          const cssH =
            Number(img.getAttribute('height')) || Math.round(rect.height) || 80;

          const offCanvas = document.createElement('canvas');
          offCanvas.width = cssW * scaleFactor;
          offCanvas.height = cssH * scaleFactor;
          const ctx = offCanvas.getContext('2d');
          if (ctx) {
            // Pintar fondo blanco puro para evitar fondos grises en logos PNG térmicos
            ctx.fillStyle = '#FFFFFF';
            ctx.fillRect(0, 0, offCanvas.width, offCanvas.height);

            if (format === 'THERMAL_80MM') {
              ctx.filter = 'grayscale(100%) contrast(250%) brightness(1.15)';
            }
            const natW = img.naturalWidth || cssW;
            const natH = img.naturalHeight || cssH;
            const ratio = Math.min(
              (cssW * scaleFactor) / natW,
              (cssH * scaleFactor) / natH
            );
            const drawW = natW * ratio;
            const drawH = natH * ratio;
            const offsetX = (cssW * scaleFactor - drawW) / 2;
            const offsetY = (cssH * scaleFactor - drawH) / 2;

            ctx.drawImage(img, offsetX, offsetY, drawW, drawH);
            imgCanvasMap.set(idx, {
              canvas: offCanvas,
              cssWidth: cssW,
              cssHeight: cssH,
            });
          }
        } catch {
          // Ignorar error individual
        }
      })
    );

    // 2. Pre-renderizar todos los <svg> vivos a HTMLCanvasElement a escala 3x
    const liveSvgs = Array.from(element.querySelectorAll('svg'));
    const svgCanvasMap = new Map<
      number,
      { canvas: HTMLCanvasElement; cssWidth: number; cssHeight: number }
    >();

    await Promise.all(
      liveSvgs.map(async (svgEl, idx) => {
        try {
          const rect = svgEl.getBoundingClientRect();
          const cssW =
            Number(svgEl.getAttribute('width')) ||
            Math.round(rect.width) ||
            210;
          const cssH =
            Number(svgEl.getAttribute('height')) ||
            Math.round(rect.height) ||
            80;

          const serializer = new XMLSerializer();
          let svgString = serializer.serializeToString(svgEl);
          if (!svgString.includes('xmlns=')) {
            svgString = svgString.replace(
              '<svg',
              '<svg xmlns="http://www.w3.org/2000/svg"'
            );
          }

          const svgBlob = new Blob([svgString], {
            type: 'image/svg+xml;charset=utf-8',
          });
          const blobUrl = URL.createObjectURL(svgBlob);

          await new Promise<void>((resolve) => {
            const tempImg = new Image();
            tempImg.onload = () => {
              const offCanvas = document.createElement('canvas');
              offCanvas.width = cssW * scaleFactor;
              offCanvas.height = cssH * scaleFactor;
              const ctx = offCanvas.getContext('2d');
              if (ctx) {
                ctx.drawImage(
                  tempImg,
                  0,
                  0,
                  cssW * scaleFactor,
                  cssH * scaleFactor
                );
                svgCanvasMap.set(idx, {
                  canvas: offCanvas,
                  cssWidth: cssW,
                  cssHeight: cssH,
                });
              }
              URL.revokeObjectURL(blobUrl);
              resolve();
            };
            tempImg.onerror = () => {
              URL.revokeObjectURL(blobUrl);
              resolve();
            };
            tempImg.src = blobUrl;
          });
        } catch {
          // Ignorar error individual
        }
      })
    );

    return await html2canvas(element, {
      scale: 2,
      useCORS: true,
      allowTaint: true,
      backgroundColor: '#ffffff',
      logging: false,
      onclone: (clonedDoc) => {
        const clonedArea = clonedDoc.getElementById('invoice-print-area');
        if (!clonedArea) return;

        // Reemplazar cada <img> clonado por un <canvas> síncrono con los píxeles ya copiados
        const clonedImgs = Array.from(clonedArea.querySelectorAll('img'));
        clonedImgs.forEach((cImg, idx) => {
          const entry = imgCanvasMap.get(idx);
          if (entry && cImg.parentNode) {
            const replacementCanvas = clonedDoc.createElement('canvas');
            replacementCanvas.width = entry.canvas.width;
            replacementCanvas.height = entry.canvas.height;
            replacementCanvas.style.width = `${entry.cssWidth}px`;
            replacementCanvas.style.height = `${entry.cssHeight}px`;
            replacementCanvas.style.display = 'block';
            replacementCanvas.style.margin = '0 auto';
            const rCtx = replacementCanvas.getContext('2d');
            if (rCtx) {
              rCtx.drawImage(entry.canvas, 0, 0);
            }
            cImg.parentNode.replaceChild(replacementCanvas, cImg);
          }
        });

        // Reemplazar cada <svg> clonado por un <canvas> síncrono con los píxeles ya copiados
        const clonedSvgs = Array.from(clonedArea.querySelectorAll('svg'));
        clonedSvgs.forEach((cSvg, idx) => {
          const entry = svgCanvasMap.get(idx);
          if (entry && cSvg.parentNode) {
            const replacementCanvas = clonedDoc.createElement('canvas');
            replacementCanvas.width = entry.canvas.width;
            replacementCanvas.height = entry.canvas.height;
            replacementCanvas.style.width = `${entry.cssWidth}px`;
            replacementCanvas.style.height = `${entry.cssHeight}px`;
            replacementCanvas.style.display = 'block';
            replacementCanvas.style.margin = '0 auto';
            const rCtx = replacementCanvas.getContext('2d');
            if (rCtx) {
              rCtx.drawImage(entry.canvas, 0, 0);
            }
            cSvg.parentNode.replaceChild(replacementCanvas, cSvg);
          }
        });
      },
    });
  };

  /**
   * Captura el documento en PNG de alta resolución y lo comparte/copia para WhatsApp
   */
  const handleSendWhatsAppWithPNG = async () => {
    if (!printableRef.current || isExporting) return;
    setIsExporting(true);

    try {
      const canvas = await capturePrintableCanvas();

      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob((b) => resolve(b), 'image/png', 1.0)
      );

      if (!blob) {
        window.open(whatsappUrl, '_blank', 'noopener,noreferrer');
        return;
      }

      const fileName = `${header.documentNumber}.png`;
      const pngFile = new File([blob], fileName, { type: 'image/png' });

      if (
        typeof navigator !== 'undefined' &&
        navigator.canShare &&
        navigator.canShare({ files: [pngFile] })
      ) {
        await navigator.share({
          files: [pngFile],
          title: `${displayTitle} ${header.documentNumber}`,
          text: `${header.brandName} • ${displayTitle} ${header.documentNumber}`,
        });
        triggerToast('Imagen PNG compartida directamente.');
        return;
      }

      let copiedToClipboard = false;
      if (
        typeof navigator !== 'undefined' &&
        navigator.clipboard &&
        typeof ClipboardItem !== 'undefined'
      ) {
        try {
          await navigator.clipboard.write([
            new ClipboardItem({ 'image/png': blob }),
          ]);
          copiedToClipboard = true;
        } catch {
          copiedToClipboard = false;
        }
      }

      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      window.open(whatsappUrl, '_blank', 'noopener,noreferrer');

      triggerToast(
        copiedToClipboard
          ? '¡Imagen PNG copiada al portapapeles y descargada! Presiona Ctrl+V en WhatsApp para adjuntarla.'
          : `Imagen ${fileName} descargada. Adjúntala en la ventana de WhatsApp.`
      );
    } catch {
      window.open(whatsappUrl, '_blank', 'noopener,noreferrer');
    } finally {
      setIsExporting(false);
    }
  };

  /**
   * Genera el PDF (Carta/A4 o Ticket 80mm) y lo envía/descarga para WhatsApp
   */
  const handleSendWhatsAppWithPDF = async () => {
    if (!printableRef.current || isExporting) return;
    setIsExporting(true);

    try {
      const canvas = await capturePrintableCanvas();
      const imgData = canvas.toDataURL('image/png');
      const fileName = `${header.documentNumber}.pdf`;

      let pdf: jsPDF;
      if (format === 'THERMAL_80MM') {
        const pdfWidthMm = 76;
        const pdfHeightMm = (canvas.height * pdfWidthMm) / canvas.width;
        pdf = new jsPDF({
          orientation: 'portrait',
          unit: 'mm',
          format: [pdfWidthMm, Math.max(100, pdfHeightMm + 8)],
        });
        pdf.addImage(imgData, 'PNG', 2, 2, pdfWidthMm - 4, pdfHeightMm);
      } else {
        pdf = new jsPDF({
          orientation: 'portrait',
          unit: 'mm',
          format: 'a4',
        });
        const pageWidth = pdf.internal.pageSize.getWidth();
        const margin = 10;
        const usableWidth = pageWidth - margin * 2;
        const imgHeight = (canvas.height * usableWidth) / canvas.width;
        pdf.addImage(imgData, 'PNG', margin, margin, usableWidth, imgHeight);
      }

      const pdfBlob = pdf.output('blob');
      const pdfFile = new File([pdfBlob], fileName, {
        type: 'application/pdf',
      });

      if (
        typeof navigator !== 'undefined' &&
        navigator.canShare &&
        navigator.canShare({ files: [pdfFile] })
      ) {
        await navigator.share({
          files: [pdfFile],
          title: `${displayTitle} ${header.documentNumber}`,
          text: `${header.brandName} • ${displayTitle} ${header.documentNumber}`,
        });
        triggerToast('Archivo PDF compartido directamente.');
        return;
      }

      pdf.save(fileName);
      window.open(whatsappUrl, '_blank', 'noopener,noreferrer');
      triggerToast(
        `PDF ${fileName} descargado. Arrástralo al chat de WhatsApp que se abrió.`
      );
    } catch {
      window.open(whatsappUrl, '_blank', 'noopener,noreferrer');
    } finally {
      setIsExporting(false);
    }
  };

  // Filtrar bloques de Comanda Cocina vs Bar
  const visibleKitchenTickets: KitchenTicketBlock[] =
    data.isKitchenOrder && data.kitchenTickets
      ? data.kitchenTickets.filter(
          (t) => stationFilter === 'ALL' || t.station === stationFilter
        )
      : [];

  return (
    <div className="print-modal-backdrop fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
      {shareToast && (
        <div className="no-print fixed bottom-6 right-6 z-50 flex items-center gap-2.5 px-4 py-3 rounded-xl bg-slate-900 text-white text-xs font-medium shadow-2xl border border-slate-700 max-w-md">
          <Check className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{shareToast}</span>
        </div>
      )}

      <div className="print-modal-container bg-slate-100 rounded-2xl border border-slate-200 shadow-2xl max-w-4xl w-full flex flex-col max-h-[92vh]">
        {/* BARRA SUPERIOR DE CONTROLES (NO SE IMPRIME) */}
        <div className="no-print bg-white border-b border-slate-200 rounded-t-2xl px-4 sm:px-6 py-3.5 sm:py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-sm font-bold text-slate-900">
              {data.isKitchenOrder
                ? 'Comanda (Cocina / Bar)'
                : 'Vista de Impresión'}
            </span>

            {data.isKitchenOrder ? (
              <div className="inline-flex items-center p-1 rounded-xl bg-slate-100 border border-slate-200/80">
                <button
                  type="button"
                  onClick={() => setStationFilter('ALL')}
                  className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    stationFilter === 'ALL'
                      ? 'bg-slate-900 text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <span>Todo</span>
                </button>
                <button
                  type="button"
                  onClick={() => setStationFilter('COCINA')}
                  className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    stationFilter === 'COCINA'
                      ? 'bg-amber-500 text-slate-950 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <ChefHat className="w-3.5 h-3.5" />
                  <span>Cocina</span>
                </button>
                <button
                  type="button"
                  onClick={() => setStationFilter('BAR')}
                  className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    stationFilter === 'BAR'
                      ? 'bg-sky-600 text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Wine className="w-3.5 h-3.5" />
                  <span>Bar</span>
                </button>
              </div>
            ) : (
              <div className="inline-flex items-center p-1 rounded-xl bg-slate-100 border border-slate-200/80">
                <button
                  type="button"
                  onClick={() => setFormat('A4')}
                  className={`inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                    format === 'A4'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <FileText className="w-3.5 h-3.5" />
                  <span>Carta / A4</span>
                </button>
                <button
                  type="button"
                  onClick={() => setFormat('THERMAL_80MM')}
                  className={`inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                    format === 'THERMAL_80MM'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Receipt className="w-3.5 h-3.5" />
                  <span>Ticket 80mm</span>
                </button>
              </div>
            )}

            <button
              type="button"
              onClick={onClose}
              className="sm:hidden p-2 rounded-xl text-slate-500 hover:text-slate-900 bg-slate-100"
              title="Cerrar"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-2">
            {!data.isKitchenOrder && (
              <>
                <button
                  type="button"
                  disabled={isExporting}
                  onClick={handleSendWhatsAppWithPNG}
                  className="inline-flex items-center justify-center gap-1.5 px-3 py-2.5 sm:py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 text-white text-xs font-semibold transition-colors shadow-xs"
                  title="Copia la imagen al portapapeles (Ctrl+V), la descarga en PNG y abre WhatsApp"
                >
                  <MessageCircle className="w-4 h-4 shrink-0" />
                  <ImageIcon className="w-3.5 h-3.5 shrink-0" />
                  <span>WhatsApp (PNG)</span>
                </button>

                <button
                  type="button"
                  disabled={isExporting}
                  onClick={handleSendWhatsAppWithPDF}
                  className="inline-flex items-center justify-center gap-1.5 px-3 py-2.5 sm:py-2 rounded-xl bg-teal-700 hover:bg-teal-600 disabled:opacity-60 text-white text-xs font-semibold transition-colors shadow-xs"
                  title="Genera el PDF del documento y abre WhatsApp"
                >
                  <Download className="w-3.5 h-3.5 shrink-0" />
                  <span>WhatsApp (PDF)</span>
                </button>
              </>
            )}

            <button
              type="button"
              onClick={() => window.print()}
              className="col-span-2 sm:col-span-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 sm:py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold transition-colors shadow-xs"
            >
              <Printer className="w-4 h-4 shrink-0" />
              <span>
                {data.isKitchenOrder ? 'Imprimir Comanda 80mm' : 'Imprimir'}
              </span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="hidden sm:inline-flex p-2 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
              title="Cerrar"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* LIENZO DEL DOCUMENTO (PERMITE SCROLL HORIZONTAL LIMPIO EN A4 MÓVIL) */}
        <div className="print-modal-scroll p-3 sm:p-6 overflow-y-auto overflow-x-auto flex justify-start sm:justify-center">
          <div
            ref={printableRef}
            id="invoice-print-area"
            className={`bg-white text-slate-900 shadow-sm border border-slate-200/90 mx-auto ${
              format === 'A4' && !data.isKitchenOrder
                ? 'print-letter min-w-[680px] sm:min-w-0 w-full max-w-3xl rounded-2xl p-6 sm:p-10'
                : 'print-thermal w-[320px] rounded-xl px-4 py-5 text-[13px] leading-snug'
            }`}
          >
            {data.isKitchenOrder ? (
              /* ==========================================
                 DISEÑO EXCLUSIVO DE COMANDA (COCINA / BAR)
                 SIN LOGOS PESADOS Y CERO PRECIOS
                 ========================================== */
              <div className="font-mono text-black bg-white space-y-5">
                {visibleKitchenTickets.map((ticket, tIdx) => {
                  const timeStr = new Date(
                    ticket.createdAt
                  ).toLocaleTimeString('es-DO', {
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                  });

                  const modalityLabel =
                    ticket.orderType === 'PARA_LLEVAR'
                      ? 'PARA LLEVAR / EMPACAR'
                      : ticket.orderType === 'DELIVERY'
                      ? 'DELIVERY / DESPACHO'
                      : 'COMER EN SALÓN';

                  return (
                    <div key={`${ticket.station}-${tIdx}`} className="space-y-2.5">
                      {tIdx > 0 && (
                        <div className="py-3 text-center font-bold text-xs text-black border-t-2 border-b-2 border-black border-dashed my-3">
                          --- ✂ CORTAR AQUÍ ({ticket.station}) ✂ ---
                        </div>
                      )}

                      {/* ENCABEZADO DE ESTACIÓN */}
                      <div className="border-2 border-black bg-black text-white text-center py-1.5 px-2 font-sans font-black text-sm tracking-widest uppercase">
                        {ticket.station === 'BAR'
                          ? '[ ESTACIÓN: BAR / BEBIDAS ]'
                          : '[ ESTACIÓN: COCINA ]'}
                      </div>

                      {/* MODALIDAD (SI ES PARA LLEVAR O DELIVERY DESTACADO) */}
                      <div className="border-2 border-black text-center py-1 px-2 font-sans font-extrabold text-xs uppercase text-black">
                        {modalityLabel}
                      </div>

                      {/* MESA Y COMENSALES EN TAMAÑO GIGANTE */}
                      <div className="py-1 border-b-2 border-black">
                        <div className="font-sans text-lg font-black text-black uppercase leading-tight">
                          MESA: {ticket.tableName} ({ticket.zone})
                        </div>
                        <div className="flex justify-between text-xs font-bold text-black pt-1">
                          <span>Mesero: {ticket.waiterName}</span>
                          <span>PAX: {ticket.guests}</span>
                        </div>
                        <div className="flex justify-between text-[11px] font-bold text-black">
                          <span>Hora: {timeStr}</span>
                          <span>#{ticket.orderNumber}</span>
                        </div>
                      </div>

                      {/* LISTA DE PLATOS A PREPARAR (SIN PRECIOS) */}
                      <div className="space-y-3 py-1">
                        {ticket.items.map((item) => (
                          <div
                            key={item.id}
                            className="pb-2 border-b border-black border-dashed last:border-b-0"
                          >
                            <div className="flex items-start gap-2 font-sans text-sm font-black text-black leading-tight">
                              <span className="px-1.5 py-0.5 border-2 border-black font-mono text-sm font-black shrink-0">
                                {item.quantity}x
                              </span>
                              <div className="flex-1 uppercase">
                                {item.description}
                              </div>
                            </div>

                            {item.course && (
                              <div className="mt-1 inline-block px-1.5 py-0.5 border border-black text-[10px] font-bold uppercase text-black">
                                {COURSE_LABELS[item.course]}
                              </div>
                            )}

                            {item.extras && item.extras.length > 0 && (
                              <div className="mt-1 space-y-0.5">
                                {item.extras.map((ex) => (
                                  <div
                                    key={ex.id}
                                    className="font-sans text-xs font-black text-black uppercase"
                                  >
                                    + EXTRA: {ex.name}
                                  </div>
                                ))}
                              </div>
                            )}

                            {item.notes && item.notes.trim() !== '' && (
                              <div className="mt-1.5 p-1.5 border-2 border-black bg-white font-sans text-xs font-black text-black uppercase">
                                ⚠ NOTA: {item.notes.toUpperCase()}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>

                      <div className="border-t-2 border-black pt-1.5 text-center text-[11px] font-bold text-black uppercase">
                        FIN DE COMANDA • {ticket.station}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : format === 'A4' ? (
              /* ==========================================
                 FORMATO HOJA CARTA / A4
                 ========================================== */
              <div className="space-y-6">
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-6 pb-6 border-b border-slate-200">
                  <div className="space-y-2">
                    <BrandLogo brandId={header.brandId} size="md" />
                    <div className="pt-1">
                      <h2 className="text-base font-bold text-slate-900">
                        {header.brandName}
                      </h2>
                      <p className="text-xs text-slate-500">
                        {header.brandSubtitle} • Tel: {header.brandPhone}
                      </p>

                      {header.isFiscal &&
                        header.corporateLegalName &&
                        header.corporateRnc && (
                          <div className="mt-2 pt-2 border-t border-slate-100 text-xs">
                            <p className="font-bold text-slate-900">
                              {header.corporateLegalName} | RNC:{' '}
                              <span className="font-mono">
                                {header.corporateRnc}
                              </span>
                            </p>
                            {header.regMercantil && (
                              <p className="text-[11px] font-mono text-slate-500">
                                Reg. Mercantil: {header.regMercantil}
                              </p>
                            )}
                          </div>
                        )}
                    </div>
                  </div>

                  <div className="sm:text-right bg-slate-50 px-5 py-3.5 rounded-xl border border-slate-200/80 shrink-0">
                    <span className="text-xs font-extrabold uppercase tracking-wider text-slate-800 block">
                      {displayTitle}
                    </span>
                    <span className="text-base font-mono font-bold text-slate-900 block mt-0.5">
                      {header.isFiscal
                        ? `NCF: ${header.documentNumber}`
                        : `No. ${header.documentNumber}`}
                    </span>

                    {data.modifiedNcf && (
                      <div className="mt-1 text-[11px] font-mono font-semibold text-rose-700">
                        NCF Modificado: {data.modifiedNcf}
                      </div>
                    )}

                    {header.isFiscal && (
                      <div className="mt-1.5 text-[11px] font-mono text-slate-500 space-y-0.5">
                        <div>No. Autorización: {effectiveAuthNo}</div>
                        <div>Vencimiento: {effectiveExpDate}</div>
                      </div>
                    )}
                    <div className="mt-1.5 text-[11px] font-mono text-slate-500">
                      Fecha: {formattedDate}
                    </div>
                  </div>
                </div>

                {/* DATOS DEL CLIENTE */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-slate-50/70 rounded-xl p-4 border border-slate-200/60 text-xs">
                  <div>
                    <span className="text-slate-400 block text-[10px] uppercase font-semibold">
                      Cliente
                    </span>
                    <strong className="text-slate-900 font-semibold">
                      {data.clientName}
                    </strong>
                  </div>

                  {header.isFiscal && data.clientRncOrCedula ? (
                    <div>
                      <span className="text-slate-400 block text-[10px] uppercase font-semibold">
                        RNC / Cédula
                      </span>
                      <strong className="text-slate-900 font-mono">
                        {data.clientRncOrCedula}
                      </strong>
                    </div>
                  ) : (
                    <div>
                      <span className="text-slate-400 block text-[10px] uppercase font-semibold">
                        Teléfono
                      </span>
                      <span className="text-slate-800 font-mono">
                        {data.clientPhone || '—'}
                      </span>
                    </div>
                  )}

                  {header.isFiscal && (
                    <div>
                      <span className="text-slate-400 block text-[10px] uppercase font-semibold">
                        Teléfono
                      </span>
                      <span className="text-slate-800 font-mono">
                        {data.clientPhone || '—'}
                      </span>
                    </div>
                  )}
                </div>

                {/* ESPECIFICACIONES DINÁMICAS (ATELIER O TÉCNICAS) */}
                {data.atelierSpec && (
                  <div className="rounded-xl border border-stone-200 bg-stone-50/60 p-4 space-y-2 text-xs">
                    <div className="font-bold text-slate-800 uppercase tracking-wider text-[10px]">
                      Ficha de Confección y Medidas
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 font-mono text-slate-700">
                      <div>
                        <span className="text-slate-400">Busto:</span>{' '}
                        <strong>{data.atelierSpec.bust || '—'}</strong>
                      </div>
                      <div>
                        <span className="text-slate-400">Cintura:</span>{' '}
                        <strong>{data.atelierSpec.waist || '—'}</strong>
                      </div>
                      <div>
                        <span className="text-slate-400">Cadera:</span>{' '}
                        <strong>{data.atelierSpec.hips || '—'}</strong>
                      </div>
                      <div>
                        <span className="text-slate-400">Largo:</span>{' '}
                        <strong>{data.atelierSpec.length || '—'}</strong>
                      </div>
                    </div>
                    {data.atelierSpec.fabricAndDesign && (
                      <p className="text-slate-700">
                        <span className="text-slate-400">Tela y Diseño: </span>
                        {data.atelierSpec.fabricAndDesign}
                      </p>
                    )}
                    <div className="flex flex-wrap gap-4 text-[11px] font-mono text-slate-600 pt-1">
                      {data.atelierSpec.fittingDate && (
                        <span>
                          Fecha de Prueba: {data.atelierSpec.fittingDate}
                        </span>
                      )}
                      {data.atelierSpec.deliveryDate && (
                        <span>
                          Fecha de Entrega: {data.atelierSpec.deliveryDate}
                        </span>
                      )}
                    </div>
                  </div>
                )}

                {data.techSpec && (
                  <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4 space-y-1.5 text-xs">
                    <div className="font-bold text-slate-800 uppercase tracking-wider text-[10px]">
                      Especificaciones Técnicas del Servicio
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <div>
                        <span className="text-slate-400">Equipo / Área: </span>
                        <strong className="text-slate-800">
                          {data.techSpec.equipmentOrArea || '—'}
                        </strong>
                      </div>
                      <div>
                        <span className="text-slate-400">Serial / Modelo: </span>
                        <span className="font-mono text-slate-700">
                          {data.techSpec.serialOrModel || '—'}
                        </span>
                      </div>
                    </div>
                    {data.techSpec.diagnosisAndWork && (
                      <p className="text-slate-700">
                        <span className="text-slate-400">
                          Trabajo a realizar:{' '}
                        </span>
                        {data.techSpec.diagnosisAndWork}
                      </p>
                    )}
                    <div className="flex flex-wrap gap-4 text-[11px] font-mono text-slate-600 pt-1">
                      {data.techSpec.warrantyPeriod && (
                        <span>Garantía: {data.techSpec.warrantyPeriod}</span>
                      )}
                      {data.techSpec.deliveryDate && (
                        <span>
                          Entrega Estimada: {data.techSpec.deliveryDate}
                        </span>
                      )}
                    </div>
                  </div>
                )}

                {/* TABLA DE ÍTEMS */}
                <div>
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 text-slate-400 uppercase text-[10px]">
                        <th className="py-2 text-left">Cant.</th>
                        <th className="py-2 text-left">Descripción</th>
                        <th className="py-2 text-right">Precio Unit.</th>
                        <th className="py-2 text-right">Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {data.items.map((item) => {
                        const extrasSum = (item.extras || []).reduce(
                          (acc, ex) => acc + ex.price,
                          0
                        );
                        const effectiveUnit = item.unitPrice + extrasSum;
                        const lineTotal = item.isCourtesy
                          ? 0
                          : Math.max(
                              0,
                              item.quantity * effectiveUnit -
                                (item.discount || 0)
                            );
                        return (
                          <tr key={item.id}>
                            <td className="py-2.5 font-mono text-slate-600">
                              {item.quantity} {item.unit}
                            </td>
                            <td className="py-2.5 font-medium text-slate-900">
                              <div>
                                {item.description}
                                {item.isCourtesy ? ' (CORTESÍA)' : ''}
                                {data.separateLaborAndMaterials &&
                                  item.costType && (
                                    <span className="ml-2 px-1.5 py-0.5 rounded bg-slate-100 text-[10px] font-mono text-slate-600">
                                      {item.costType === 'MANO_DE_OBRA'
                                        ? 'Mano de Obra'
                                        : item.costType === 'MATERIALES'
                                        ? 'Materiales'
                                        : 'General'}
                                    </span>
                                  )}
                              </div>
                              {item.extras && item.extras.length > 0 && (
                                <div className="text-[11px] text-slate-600 font-mono">
                                  {item.extras
                                    .map(
                                      (e) =>
                                        `+ ${e.name} (RD$ ${e.price.toLocaleString('es-DO')})`
                                    )
                                    .join(' • ')}
                                </div>
                              )}
                              {item.notes && (
                                <div className="text-[11px] text-slate-500 italic">
                                  Nota: {item.notes}
                                </div>
                              )}
                              {!item.isCourtesy &&
                              item.discount &&
                              item.discount > 0 ? (
                                <div className="text-[10px] font-mono text-rose-600">
                                  Desc: -RD${' '}
                                  {item.discount.toLocaleString('es-DO', {
                                    minimumFractionDigits: 2,
                                  })}
                                </div>
                              ) : null}
                            </td>
                            <td className="py-2.5 text-right font-mono text-slate-600">
                              RD${' '}
                              {(item.isCourtesy ? 0 : effectiveUnit).toLocaleString(
                                'es-DO',
                                {
                                  minimumFractionDigits: 2,
                                }
                              )}
                            </td>
                            <td className="py-2.5 text-right font-mono font-semibold text-slate-900">
                              RD${' '}
                              {lineTotal.toLocaleString('es-DO', {
                                minimumFractionDigits: 2,
                              })}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* HISTORIAL DE ABONOS Y TOTALES */}
                <div className="pt-4 border-t border-slate-200 flex flex-col sm:flex-row justify-between gap-6">
                  <div className="space-y-2 flex-1">
                    {data.payments && data.payments.length > 0 && (
                      <div className="space-y-1">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                          Historial de Abonos / Pagos
                        </span>
                        <div className="space-y-1">
                          {data.payments.map((p) => (
                            <div
                              key={p.id}
                              className="text-[11px] font-mono text-slate-600 flex items-center gap-2"
                            >
                              <span>
                                • {new Date(p.date).toLocaleDateString('es-DO')}
                              </span>
                              <span>({p.method}):</span>
                              <strong className="text-slate-900">
                                RD${' '}
                                {p.amount.toLocaleString('es-DO', {
                                  minimumFractionDigits: 2,
                                })}
                              </strong>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    {data.notes && (
                      <p className="text-xs text-slate-500 pt-1">
                        Nota: {data.notes}
                      </p>
                    )}
                  </div>

                  <div className="w-full sm:w-64 space-y-2 text-xs font-mono shrink-0">
                    {data.separateLaborAndMaterials &&
                      (laborSubtotal > 0 || materialsSubtotal > 0) && (
                        <div className="pb-1.5 mb-1.5 border-b border-slate-200 space-y-1">
                          <div className="flex justify-between text-slate-600">
                            <span>Subtotal Mano de Obra:</span>
                            <span>
                              RD${' '}
                              {laborSubtotal.toLocaleString('es-DO', {
                                minimumFractionDigits: 2,
                              })}
                            </span>
                          </div>
                          <div className="flex justify-between text-slate-600">
                            <span>Subtotal Materiales:</span>
                            <span>
                              RD${' '}
                              {materialsSubtotal.toLocaleString('es-DO', {
                                minimumFractionDigits: 2,
                              })}
                            </span>
                          </div>
                        </div>
                      )}

                    {data.discountTotal && data.discountTotal > 0 ? (
                      <div className="flex justify-between text-rose-600 py-0.5">
                        <span>
                          Descuento
                          {data.promoCodeApplied
                            ? ` (${data.promoCodeApplied})`
                            : ''}
                          :
                        </span>
                        <span>
                          - RD${' '}
                          {data.discountTotal.toLocaleString('es-DO', {
                            minimumFractionDigits: 2,
                          })}
                        </span>
                      </div>
                    ) : null}

                    {(header.showItbisBreakdown || isPreCuenta) && (
                      <>
                        <div className="flex justify-between text-slate-600 py-0.5">
                          <span>Subtotal:</span>
                          <span>
                            RD${' '}
                            {data.subtotal.toLocaleString('es-DO', {
                              minimumFractionDigits: 2,
                            })}
                          </span>
                        </div>
                        {data.itbisAmount > 0 && (
                          <div className="flex justify-between text-slate-800 py-0.5">
                            <span>18% ITBIS:</span>
                            <span>
                              RD${' '}
                              {data.itbisAmount.toLocaleString('es-DO', {
                                minimumFractionDigits: 2,
                              })}
                            </span>
                          </div>
                        )}
                      </>
                    )}

                    {data.legalTipAmount && data.legalTipAmount > 0 ? (
                      <div className="flex justify-between text-slate-600 py-0.5">
                        <span>10% Propina Legal:</span>
                        <span>
                          RD${' '}
                          {data.legalTipAmount.toLocaleString('es-DO', {
                            minimumFractionDigits: 2,
                          })}
                        </span>
                      </div>
                    ) : null}

                    {data.voluntaryTipAmount && data.voluntaryTipAmount > 0 ? (
                      <div className="flex justify-between text-emerald-700 font-semibold py-0.5">
                        <span>Propina Voluntaria / Mesero:</span>
                        <span>
                          RD${' '}
                          {data.voluntaryTipAmount.toLocaleString('es-DO', {
                            minimumFractionDigits: 2,
                          })}
                        </span>
                      </div>
                    ) : null}

                    <div className="my-1.5 border-t border-slate-200" />

                    <div className="flex justify-between text-sm font-bold text-slate-900 py-0.5">
                      <span>{isPreCuenta ? 'TOTAL A PAGAR:' : 'Total Acordado:'}</span>
                      <span>
                        RD${' '}
                        {(
                          data.totalAmount + (data.voluntaryTipAmount || 0)
                        ).toLocaleString('es-DO', {
                          minimumFractionDigits: 2,
                        })}
                      </span>
                    </div>

                    {!isPreCuenta && (
                      <>
                        <div className="flex justify-between text-teal-700 font-semibold py-0.5">
                          <span>Total Abonado:</span>
                          <span>
                            RD${' '}
                            {(
                              data.amountPaid + (data.voluntaryTipAmount || 0)
                            ).toLocaleString('es-DO', {
                              minimumFractionDigits: 2,
                            })}
                          </span>
                        </div>

                        <div className="my-1.5 border-t border-slate-200" />

                        <div className="flex justify-between text-slate-900 font-bold py-0.5">
                          <span>Balance Pendiente:</span>
                          <span>
                            RD${' '}
                            {data.balanceDue.toLocaleString('es-DO', {
                              minimumFractionDigits: 2,
                            })}
                          </span>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              /* ==========================================
                 FORMATO TICKET TÉRMICO 80MM (ANCHO COMPLETO Y CENTRADO)
                 ========================================== */
              <div className="font-mono text-[13px] text-black font-semibold bg-white">
                <div className="text-center pb-2.5">
                  <div className="mb-2 w-full flex justify-center items-center bg-white">
                    <BrandLogo brandId={header.brandId} variant="thermal" />
                  </div>
                  <div className="font-sans font-extrabold text-sm text-black">
                    {header.brandName}
                  </div>
                  <div className="text-[11px] text-black font-semibold">
                    Tel: {header.brandPhone}
                  </div>

                  {header.isFiscal &&
                    header.corporateLegalName &&
                    header.corporateRnc && (
                      <div className="mt-1.5 pt-1.5 text-[11px] text-black font-semibold">
                        <div className="font-bold">
                          {header.corporateLegalName}
                        </div>
                        <div>RNC: {header.corporateRnc}</div>
                      </div>
                    )}
                </div>

                <div className="my-2 border-t border-black border-dashed" />

                <div className="space-y-0.5 py-1 text-black font-semibold text-xs">
                  <div className="font-extrabold text-black uppercase text-[13px]">
                    {displayTitle}
                  </div>
                  <div>
                    {header.isFiscal
                      ? `NCF: ${header.documentNumber}`
                      : `No: ${header.documentNumber}`}
                  </div>
                  {data.modifiedNcf && (
                    <div>NCF Modificado: {data.modifiedNcf}</div>
                  )}
                  {header.isFiscal && (
                    <>
                      <div>Aut. DGII: {effectiveAuthNo}</div>
                      <div>Vence: {effectiveExpDate}</div>
                    </>
                  )}
                  <div>Fecha: {formattedDate}</div>
                  <div>Cliente: {data.clientName}</div>
                  {data.clientRncOrCedula && (
                    <div>RNC/Céd: {data.clientRncOrCedula}</div>
                  )}
                </div>

                <div className="my-2 border-t border-black border-dashed" />

                <div className="space-y-2 py-1">
                  {data.items.map((item) => {
                    const extrasSum = (item.extras || []).reduce(
                      (acc, ex) => acc + ex.price,
                      0
                    );
                    const effectiveUnit = item.unitPrice + extrasSum;
                    const lineTotal = item.isCourtesy
                      ? 0
                      : Math.max(
                          0,
                          item.quantity * effectiveUnit - (item.discount || 0)
                        );
                    return (
                      <div
                        key={item.id}
                        className="space-y-0.5 text-black font-semibold text-xs"
                      >
                        <div className="text-black font-bold leading-snug">
                          {item.description}
                          {item.isCourtesy ? ' (CORTESÍA)' : ''}
                          {data.separateLaborAndMaterials && item.costType
                            ? ` [${
                                item.costType === 'MANO_DE_OBRA'
                                  ? 'M.OBRA'
                                  : item.costType === 'MATERIALES'
                                  ? 'MAT.'
                                  : 'GEN'
                              }]`
                            : ''}
                        </div>
                        {item.extras && item.extras.length > 0 && (
                          <div className="text-[11px] text-black font-bold">
                            {item.extras
                              .map(
                                (e) => `+ ${e.name} (RD$ ${e.price})`
                              )
                              .join(', ')}
                          </div>
                        )}
                        {item.notes && (
                          <div className="text-[11px] text-black font-bold">
                            * {item.notes}
                          </div>
                        )}
                        <div className="flex justify-between text-black font-semibold">
                          <span>
                            {item.quantity} x RD${' '}
                            {(item.isCourtesy ? 0 : effectiveUnit).toLocaleString(
                              'es-DO',
                              {
                                minimumFractionDigits: 2,
                              }
                            )}
                            {!item.isCourtesy &&
                            item.discount &&
                            item.discount > 0
                              ? ` (-${item.discount})`
                              : ''}
                          </span>
                          <span className="font-bold text-black">
                            RD${' '}
                            {lineTotal.toLocaleString('es-DO', {
                              minimumFractionDigits: 2,
                            })}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="my-2 border-t border-black border-dashed" />

                <div className="space-y-1 py-1 text-black font-semibold text-xs">
                  {data.separateLaborAndMaterials &&
                    (laborSubtotal > 0 || materialsSubtotal > 0) && (
                      <>
                        <div className="flex justify-between py-0.5">
                          <span>Subt. Mano de Obra:</span>
                          <span>
                            RD${' '}
                            {laborSubtotal.toLocaleString('es-DO', {
                              minimumFractionDigits: 2,
                            })}
                          </span>
                        </div>
                        <div className="flex justify-between py-0.5">
                          <span>Subt. Materiales:</span>
                          <span>
                            RD${' '}
                            {materialsSubtotal.toLocaleString('es-DO', {
                              minimumFractionDigits: 2,
                            })}
                          </span>
                        </div>
                      </>
                    )}

                  {data.discountTotal && data.discountTotal > 0 ? (
                    <div className="flex justify-between py-0.5">
                      <span>
                        Desc.
                        {data.promoCodeApplied
                          ? ` (${data.promoCodeApplied})`
                          : ''}
                        :
                      </span>
                      <span>
                        -RD${' '}
                        {data.discountTotal.toLocaleString('es-DO', {
                          minimumFractionDigits: 2,
                        })}
                      </span>
                    </div>
                  ) : null}

                  {(header.showItbisBreakdown || isPreCuenta) && (
                    <>
                      <div className="flex justify-between py-0.5">
                        <span>Subtotal:</span>
                        <span>
                          RD${' '}
                          {data.subtotal.toLocaleString('es-DO', {
                            minimumFractionDigits: 2,
                          })}
                        </span>
                      </div>
                      {data.itbisAmount > 0 && (
                        <div className="flex justify-between py-0.5">
                          <span>18% ITBIS:</span>
                          <span>
                            RD${' '}
                            {data.itbisAmount.toLocaleString('es-DO', {
                              minimumFractionDigits: 2,
                            })}
                          </span>
                        </div>
                      )}
                    </>
                  )}

                  {data.legalTipAmount && data.legalTipAmount > 0 ? (
                    <div className="flex justify-between py-0.5">
                      <span>10% Propina Legal:</span>
                      <span>
                        RD${' '}
                        {data.legalTipAmount.toLocaleString('es-DO', {
                          minimumFractionDigits: 2,
                        })}
                      </span>
                    </div>
                  ) : null}

                  {data.voluntaryTipAmount && data.voluntaryTipAmount > 0 ? (
                    <div className="flex justify-between py-0.5">
                      <span>Propina Voluntaria:</span>
                      <span>
                        RD${' '}
                        {data.voluntaryTipAmount.toLocaleString('es-DO', {
                          minimumFractionDigits: 2,
                        })}
                      </span>
                    </div>
                  ) : null}

                  <div className="flex justify-between font-black text-sm text-black py-1 border-t border-black border-dashed mt-1">
                    <span>{isPreCuenta ? 'TOTAL A PAGAR:' : 'TOTAL:'}</span>
                    <span>
                      RD${' '}
                      {(
                        data.totalAmount + (data.voluntaryTipAmount || 0)
                      ).toLocaleString('es-DO', {
                        minimumFractionDigits: 2,
                      })}
                    </span>
                  </div>

                  {!isPreCuenta && (
                    <>
                      <div className="flex justify-between text-black font-semibold py-0.5">
                        <span>Total Abonado:</span>
                        <span>
                          RD${' '}
                          {(
                            data.amountPaid + (data.voluntaryTipAmount || 0)
                          ).toLocaleString('es-DO', {
                            minimumFractionDigits: 2,
                          })}
                        </span>
                      </div>

                      {data.balanceDue > 0 && (
                        <div className="flex justify-between font-bold text-black py-0.5">
                          <span>Balance Pendiente:</span>
                          <span>
                            RD${' '}
                            {data.balanceDue.toLocaleString('es-DO', {
                              minimumFractionDigits: 2,
                            })}
                          </span>
                        </div>
                      )}
                    </>
                  )}
                </div>

                {data.notes && (
                  <div className="py-1 text-[11px] text-black font-bold">
                    {data.notes}
                  </div>
                )}

                <div className="my-2 border-t border-black border-dashed" />

                <div className="pt-1 text-center text-[11px] text-black font-semibold">
                  ¡Gracias por preferir a {header.brandName}!
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
