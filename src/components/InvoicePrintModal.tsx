import React, { useRef, useState } from 'react';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import {
  Check,
  Download,
  FileText,
  Image as ImageIcon,
  MessageCircle,
  Printer,
  Receipt,
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

export interface PrintableDocumentData {
  isFiscal: boolean;
  brand: BrandProfile;
  corporate: CorporateConfig;
  ncfSequence?: NCFSequence;
  documentCode: string;
  internalDocTitle?: InternalDocType;
  authorizationNo?: string;
  expirationDate?: string;
  clientName: string;
  clientRncOrCedula?: string;
  clientPhone?: string;
  createdAt: string;
  items: InvoiceItem[];
  subtotal: number;
  itbisAmount: number;
  legalTipAmount?: number;
  totalAmount: number;
  amountPaid: number;
  balanceDue: number;
  payments?: OrderPaymentRecord[];
  atelierSpec?: AtelierOrderSpec;
  techSpec?: TechnicalOrderSpec;
  notes?: string;
}

interface InvoicePrintModalProps {
  data: PrintableDocumentData | null;
  onClose: () => void;
}

export const InvoicePrintModal: React.FC<InvoicePrintModalProps> = ({
  data,
  onClose,
}) => {
  const [format, setFormat] = useState<'A4' | 'THERMAL_80MM'>('A4');
  const [isExporting, setIsExporting] = useState<boolean>(false);
  const [shareToast, setShareToast] = useState<string | null>(null);
  const printableRef = useRef<HTMLDivElement | null>(null);

  if (!data) return null;

  const header = buildDocumentHeaderMetadata({
    isFiscal: data.isFiscal,
    brand: data.brand,
    corporate: data.corporate,
    ncfSequence: data.ncfSequence,
    consumedCode: data.documentCode,
    internalDocTitle: data.internalDocTitle,
  });

  const effectiveAuthNo = data.authorizationNo || header.authorizationNo;
  const effectiveExpDate = data.expirationDate || header.expirationDate;

  const whatsappUrl = buildWhatsAppShareUrl({
    phone: data.clientPhone || data.brand.phone,
    brandName: header.brandName,
    documentTitle: header.documentTitle,
    documentCode: header.documentNumber,
    clientName: data.clientName,
    itemsSummary: data.items.map(
      (i) =>
        `${i.quantity}x ${i.description} (RD$ ${(
          i.quantity * i.unitPrice
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
   * Convierte cualquier <img> o <svg> dentro de #invoice-print-area a PNG Base64
   * y espera img.complete / img.decode() antes de ejecutar html2canvas
   */
  const capturePrintableCanvas = async (): Promise<HTMLCanvasElement> => {
    if (document.fonts && document.fonts.ready) {
      await document.fonts.ready;
    }

    const element = printableRef.current;
    if (!element) {
      throw new Error('Elemento de impresión no encontrado.');
    }

    // 1. Asegurar que todas las etiquetas <img> estén cargadas y decodificadas, y pre-convertirlas a Base64
    const liveImages = Array.from(element.querySelectorAll('img'));
    const imgBase64Map = new Map<number, string>();

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

          const natW = img.naturalWidth || img.width || 360;
          const natH = img.naturalHeight || img.height || 150;
          const offCanvas = document.createElement('canvas');
          offCanvas.width = natW;
          offCanvas.height = natH;
          const ctx = offCanvas.getContext('2d');
          if (ctx) {
            if (format === 'THERMAL_80MM') {
              ctx.filter = 'grayscale(100%) contrast(300%) brightness(0.8)';
            }
            ctx.drawImage(img, 0, 0, natW, natH);
            imgBase64Map.set(idx, offCanvas.toDataURL('image/png'));
          }
        } catch {
          // Mantener src original si falla
        }
      })
    );

    // 2. Pre-rasterizar los <svg> de marca (bridge-tech y atelier) a PNG Base64 de alta resolución
    const liveSvgs = Array.from(element.querySelectorAll('svg'));
    const svgBase64Map = new Map<
      number,
      { dataUrl: string; width: number; height: number }
    >();

    await Promise.all(
      liveSvgs.map(async (svgEl, idx) => {
        try {
          const rect = svgEl.getBoundingClientRect();
          const w =
            Number(svgEl.getAttribute('width')) || Math.round(rect.width) || 200;
          const h =
            Number(svgEl.getAttribute('height')) ||
            Math.round(rect.height) ||
            82;

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
              const scaleFactor = 3;
              const offCanvas = document.createElement('canvas');
              offCanvas.width = w * scaleFactor;
              offCanvas.height = h * scaleFactor;
              const ctx = offCanvas.getContext('2d');
              if (ctx) {
                ctx.drawImage(tempImg, 0, 0, w * scaleFactor, h * scaleFactor);
                svgBase64Map.set(idx, {
                  dataUrl: offCanvas.toDataURL('image/png'),
                  width: w,
                  height: h,
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
          // Fallback silencioso
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

        // Inyectar Base64 en las imágenes clonadas
        const clonedImgs = Array.from(clonedArea.querySelectorAll('img'));
        clonedImgs.forEach((cImg, idx) => {
          const b64 = imgBase64Map.get(idx);
          if (b64) {
            cImg.removeAttribute('crossorigin');
            cImg.src = b64;
          }
        });

        // Reemplazar SVGs clonados por imágenes PNG Base64 ya rasterizadas para que html2canvas nunca los omita
        const clonedSvgs = Array.from(clonedArea.querySelectorAll('svg'));
        clonedSvgs.forEach((cSvg, idx) => {
          const raster = svgBase64Map.get(idx);
          if (raster && cSvg.parentNode) {
            const replacementImg = clonedDoc.createElement('img');
            replacementImg.src = raster.dataUrl;
            replacementImg.width = raster.width;
            replacementImg.height = raster.height;
            replacementImg.style.width = `${raster.width}px`;
            replacementImg.style.height = `${raster.height}px`;
            replacementImg.style.objectFit = 'contain';
            replacementImg.style.display = 'block';
            cSvg.parentNode.replaceChild(replacementImg, cSvg);
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

      // 1. Web Share API con archivos (Móvil / Tablets)
      if (
        typeof navigator !== 'undefined' &&
        navigator.canShare &&
        navigator.canShare({ files: [pngFile] })
      ) {
        await navigator.share({
          files: [pngFile],
          title: `${header.documentTitle} ${header.documentNumber}`,
          text: `${header.brandName} • ${header.documentTitle} ${header.documentNumber}`,
        });
        triggerToast('Imagen PNG compartida directamente.');
        return;
      }

      // 2. Escritorio: copiar al portapapeles (Ctrl+V en WhatsApp) + descargar PNG + abrir chat
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
        const pdfWidthMm = 72;
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
          title: `${header.documentTitle} ${header.documentNumber}`,
          text: `${header.brandName} • ${header.documentTitle} ${header.documentNumber}`,
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

  return (
    <div className="print-modal-backdrop fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
      {/* NOTIFICACIÓN DE ENVÍO WHATSAPP */}
      {shareToast && (
        <div className="no-print fixed bottom-6 right-6 z-50 flex items-center gap-2.5 px-4 py-3 rounded-xl bg-slate-900 text-white text-xs font-medium shadow-2xl border border-slate-700 max-w-md">
          <Check className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{shareToast}</span>
        </div>
      )}

      <div className="print-modal-container bg-slate-100 rounded-2xl border border-slate-200 shadow-2xl max-w-4xl w-full flex flex-col max-h-[92vh]">
        {/* BARRA SUPERIOR DE CONTROLES (NO SE IMPRIME) */}
        <div className="no-print bg-white border-b border-slate-200 rounded-t-2xl px-6 py-4 flex flex-wrap items-center justify-between gap-4 shrink-0">
          <div className="flex items-center gap-3">
            <span className="text-sm font-bold text-slate-900">
              Vista de Impresión
            </span>
            <div className="inline-flex items-center p-1 rounded-xl bg-slate-100 border border-slate-200/80">
              <button
                type="button"
                onClick={() => setFormat('A4')}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  format === 'A4'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <FileText className="w-3.5 h-3.5" />
                <span>Hoja Carta / A4</span>
              </button>
              <button
                type="button"
                onClick={() => setFormat('THERMAL_80MM')}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  format === 'THERMAL_80MM'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Receipt className="w-3.5 h-3.5" />
                <span>Ticket Térmico 80mm</span>
              </button>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={isExporting}
              onClick={handleSendWhatsAppWithPNG}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 text-white text-xs font-semibold transition-colors shadow-xs"
              title="Copia la imagen al portapapeles (Ctrl+V), la descarga en PNG y abre WhatsApp"
            >
              <MessageCircle className="w-4 h-4" />
              <ImageIcon className="w-3.5 h-3.5" />
              <span>WhatsApp (PNG)</span>
            </button>

            <button
              type="button"
              disabled={isExporting}
              onClick={handleSendWhatsAppWithPDF}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-teal-700 hover:bg-teal-600 disabled:opacity-60 text-white text-xs font-semibold transition-colors shadow-xs"
              title="Genera el PDF del documento y abre WhatsApp"
            >
              <Download className="w-3.5 h-3.5" />
              <span>WhatsApp (PDF)</span>
            </button>

            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold transition-colors shadow-xs"
            >
              <Printer className="w-4 h-4" />
              <span>Imprimir</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
              title="Cerrar"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* LIENZO DEL DOCUMENTO */}
        <div className="print-modal-scroll p-6 overflow-y-auto flex justify-center">
          <div
            ref={printableRef}
            id="invoice-print-area"
            className={`bg-white text-slate-900 shadow-sm border border-slate-200/90 ${
              format === 'A4'
                ? 'print-letter w-full max-w-3xl rounded-2xl p-8 sm:p-10'
                : 'print-thermal w-[302px] rounded-xl px-4 py-5 text-[11px] leading-relaxed'
            }`}
          >
            {format === 'A4' ? (
              /* ==========================================
                 FORMATO HOJA CARTA / A4
                 ========================================== */
              <div className="space-y-6">
                {/* ENCABEZADO SIN OVERFLOW-HIDDEN NI TRANSFORM */}
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-6 pb-6 border-b border-slate-200">
                  <div className="space-y-2">
                    <BrandLogo brandId={header.brandId} size="md" variant="thermal" />
                    <div className="pt-1">
                      <h2 className="text-base font-bold text-slate-900">
                        {header.brandName}
                      </h2>
                      <p className="text-xs text-slate-500">
                        {header.brandSubtitle} • Tel: {header.brandPhone}
                      </p>

                      {/* REGLA ESTRICTA MODO DUAL: SOLO EN MODO FISCAL MOSTRAR RNC Y RAZÓN SOCIAL */}
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
                      {header.documentTitle}
                    </span>
                    <span className="text-base font-mono font-bold text-slate-900 block mt-0.5">
                      {header.isFiscal
                        ? `NCF: ${header.documentNumber}`
                        : `No. ${header.documentNumber}`}
                    </span>

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
                      {data.items.map((item) => (
                        <tr key={item.id}>
                          <td className="py-2.5 font-mono text-slate-600">
                            {item.quantity} {item.unit}
                          </td>
                          <td className="py-2.5 font-medium text-slate-900">
                            {item.description}
                          </td>
                          <td className="py-2.5 text-right font-mono text-slate-600">
                            RD${' '}
                            {item.unitPrice.toLocaleString('es-DO', {
                              minimumFractionDigits: 2,
                            })}
                          </td>
                          <td className="py-2.5 text-right font-mono font-semibold text-slate-900">
                            RD${' '}
                            {(item.quantity * item.unitPrice).toLocaleString(
                              'es-DO',
                              { minimumFractionDigits: 2 }
                            )}
                          </td>
                        </tr>
                      ))}
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
                    {header.showItbisBreakdown ? (
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
                        <div className="flex justify-between text-slate-800 py-0.5">
                          <span>18% ITBIS:</span>
                          <span>
                            RD${' '}
                            {data.itbisAmount.toLocaleString('es-DO', {
                              minimumFractionDigits: 2,
                            })}
                          </span>
                        </div>
                      </>
                    ) : null}

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

                    <div className="my-1.5 border-t border-slate-200" />

                    <div className="flex justify-between text-sm font-bold text-slate-900 py-0.5">
                      <span>Total Acordado:</span>
                      <span>
                        RD${' '}
                        {data.totalAmount.toLocaleString('es-DO', {
                          minimumFractionDigits: 2,
                        })}
                      </span>
                    </div>

                    <div className="flex justify-between text-teal-700 font-semibold py-0.5">
                      <span>Total Abonado:</span>
                      <span>
                        RD${' '}
                        {data.amountPaid.toLocaleString('es-DO', {
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
                  </div>
                </div>
              </div>
            ) : (
              /* ==========================================
                 FORMATO TICKET TÉRMICO 80MM (72MM PRINTABLE)
                 ========================================== */
              <div className="font-mono text-[11px] text-black bg-white">
                <div className="text-center pb-3">
                  <div className="mb-2 flex justify-center">
                    <BrandLogo brandId={header.brandId} variant="thermal" />
                  </div>
                  <div className="font-sans font-extrabold text-xs text-black">
                    {header.brandName}
                  </div>
                  <div className="text-[10px] text-neutral-700">
                    Tel: {header.brandPhone}
                  </div>

                  {header.isFiscal &&
                    header.corporateLegalName &&
                    header.corporateRnc && (
                      <div className="mt-2 pt-2 text-[10px] text-black">
                        <div className="font-bold">
                          {header.corporateLegalName}
                        </div>
                        <div>RNC: {header.corporateRnc}</div>
                      </div>
                    )}
                </div>

                <div className="my-2 border-t border-neutral-400" />

                <div className="space-y-1 py-1">
                  <div className="font-bold text-black uppercase">
                    {header.documentTitle}
                  </div>
                  <div>
                    {header.isFiscal
                      ? `NCF: ${header.documentNumber}`
                      : `No: ${header.documentNumber}`}
                  </div>
                  {header.isFiscal && (
                    <>
                      <div>Aut. DGII: {effectiveAuthNo}</div>
                      <div>Vence: {effectiveExpDate}</div>
                    </>
                  )}
                  <div>Fecha: {formattedDate}</div>
                  <div>Cliente: {data.clientName}</div>
                  {header.isFiscal && data.clientRncOrCedula && (
                    <div>RNC/Céd: {data.clientRncOrCedula}</div>
                  )}
                </div>

                <div className="my-2 border-t border-neutral-400" />

                <div className="space-y-2 py-1">
                  {data.items.map((item) => (
                    <div key={item.id} className="space-y-0.5">
                      <div className="text-black font-semibold leading-snug">
                        {item.description}
                      </div>
                      <div className="flex justify-between text-neutral-800">
                        <span>
                          {item.quantity} x RD${' '}
                          {item.unitPrice.toLocaleString('es-DO', {
                            minimumFractionDigits: 2,
                          })}
                        </span>
                        <span className="font-bold text-black">
                          RD${' '}
                          {(item.quantity * item.unitPrice).toLocaleString(
                            'es-DO',
                            { minimumFractionDigits: 2 }
                          )}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="my-2 border-t border-neutral-400" />

                <div className="space-y-1.5 py-1">
                  {header.showItbisBreakdown && (
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
                      <div className="flex justify-between py-0.5">
                        <span>18% ITBIS:</span>
                        <span>
                          RD${' '}
                          {data.itbisAmount.toLocaleString('es-DO', {
                            minimumFractionDigits: 2,
                          })}
                        </span>
                      </div>
                    </>
                  )}

                  <div className="flex justify-between font-bold text-xs text-black py-1">
                    <span>TOTAL ACORDADO:</span>
                    <span>
                      RD${' '}
                      {data.totalAmount.toLocaleString('es-DO', {
                        minimumFractionDigits: 2,
                      })}
                    </span>
                  </div>

                  <div className="flex justify-between text-black py-0.5">
                    <span>Total Abonado:</span>
                    <span>
                      RD${' '}
                      {data.amountPaid.toLocaleString('es-DO', {
                        minimumFractionDigits: 2,
                      })}
                    </span>
                  </div>

                  <div className="flex justify-between font-bold text-black py-0.5">
                    <span>Balance Pendiente:</span>
                    <span>
                      RD${' '}
                      {data.balanceDue.toLocaleString('es-DO', {
                        minimumFractionDigits: 2,
                      })}
                    </span>
                  </div>
                </div>

                <div className="my-2 border-t border-neutral-400" />

                <div className="pt-1 text-center text-[10px] text-neutral-700">
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
