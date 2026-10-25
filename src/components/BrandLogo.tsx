import React from 'react';
import { type BrandId } from '../db/db';

interface BrandLogoProps {
  brandId: BrandId;
  size?: 'sm' | 'md' | 'lg';
  variant?: 'default' | 'thermal';
  className?: string;
}

const PIXEL_DIMENSIONS: Record<
  'sm' | 'md' | 'lg',
  { width: number; height: number }
> = {
  sm: { width: 140, height: 58 },
  md: { width: 200, height: 82 },
  lg: { width: 260, height: 108 },
};

export const BrandLogo: React.FC<BrandLogoProps> = ({
  brandId,
  size = 'md',
  variant = 'default',
  className = '',
}) => {
  const { width, height } =
    variant === 'thermal' ? { width: 170, height: 64 } : PIXEL_DIMENSIONS[size];

  const isThermal = variant === 'thermal';

  // 1. BRIDGE TO SOLUTIONS
  if (brandId === 'bridge-tech') {
    if (isThermal) {
      return (
        <div className={`inline-flex items-center justify-center bg-white mx-auto shrink-0 ${className}`}>
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 700 270"
            width={width}
            height={height}
            preserveAspectRatio="xMidYMid meet"
            style={{ display: 'block' }}
          >
            <rect width="700" height="270" fill="#FFFFFF" />
            <g transform="translate(350, 92)">
              <rect x="-110" y="38" width="220" height="10" rx="3" fill="#000000" />
              <rect x="-92" y="-20" width="22" height="60" rx="3" fill="#000000" />
              <rect x="70" y="-20" width="22" height="60" rx="3" fill="#000000" />
              <path
                d="M -90 12 C -48 -45, 48 -45, 90 12"
                fill="none"
                stroke="#000000"
                strokeWidth="12"
                strokeLinecap="round"
              />
              <path
                d="M -66 22 C -35 -20, 35 -20, 66 22"
                fill="none"
                stroke="#000000"
                strokeWidth="8"
                strokeLinecap="round"
              />
              <path
                d="M -42 30 C -20 0, 20 0, 42 30"
                fill="none"
                stroke="#000000"
                strokeWidth="6"
                strokeLinecap="round"
              />
              <circle cx="-81" cy="-20" r="6" fill="#000000" />
              <circle cx="81" cy="-20" r="6" fill="#000000" />
            </g>

            <text
              x="350"
              y="195"
              textAnchor="middle"
              fontFamily="Arial, sans-serif"
              fontSize="36"
              fontWeight="800"
              fill="#000000"
              style={{
                fontFamily: "'Plus Jakarta Sans', Arial, sans-serif",
                fontSize: '36px',
                fontWeight: 800,
                fill: '#000000',
                letterSpacing: '2px',
              }}
            >
              BRIDGE TO SOLUTIONS
            </text>

            <line
              x1="220"
              y1="214"
              x2="480"
              y2="214"
              stroke="#000000"
              strokeWidth="3"
            />

            <text
              x="350"
              y="242"
              textAnchor="middle"
              fontFamily="Arial, sans-serif"
              fontSize="15"
              fontWeight="800"
              fill="#000000"
              style={{
                fontFamily: "'Plus Jakarta Sans', Arial, sans-serif",
                fontSize: '15px',
                fontWeight: 800,
                fill: '#000000',
                letterSpacing: '7px',
              }}
            >
              INTEGRATED SERVICES
            </text>
          </svg>
        </div>
      );
    }

    return (
      <div
        className={`inline-flex items-center justify-center shrink-0 rounded-xl bg-[#F8FAFC] border border-slate-200/80 p-1 ${className}`}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 700 290"
          width={width}
          height={height}
          preserveAspectRatio="xMidYMid meet"
          style={{ display: 'block' }}
        >
          <rect width="700" height="290" fill="#F8FAFC" rx="16" />

          <g transform="translate(350, 95)">
            <rect x="-105" y="38" width="210" height="6" rx="3" fill="#0F172A" />
            <rect x="-90" y="-18" width="18" height="56" rx="3" fill="#0F172A" />
            <rect x="72" y="-18" width="18" height="56" rx="3" fill="#0F172A" />

            <path
              d="M -90 12 C -48 -45, 48 -45, 90 12"
              fill="none"
              stroke="#0D9488"
              strokeWidth="9"
              strokeLinecap="round"
            />
            <path
              d="M -66 22 C -35 -20, 35 -20, 66 22"
              fill="none"
              stroke="#14B8A6"
              strokeWidth="5"
              strokeLinecap="round"
            />
            <path
              d="M -42 30 C -20 0, 20 0, 42 30"
              fill="none"
              stroke="#5EEAD4"
              strokeWidth="3.5"
              strokeLinecap="round"
            />

            <circle cx="-81" cy="-18" r="4" fill="#0D9488" />
            <circle cx="81" cy="-18" r="4" fill="#0D9488" />
          </g>

          <text
            x="350"
            y="195"
            textAnchor="middle"
            fontFamily="Plus Jakarta Sans, Arial, sans-serif"
            fontSize="32"
            style={{
              fontFamily: "'Plus Jakarta Sans', Arial, sans-serif",
              fontSize: '32px',
              letterSpacing: '2px',
            }}
          >
            <tspan fill="#0D9488" fontWeight="800">
              BRI
            </tspan>
            <tspan fill="#64748B" fontWeight="400">
              DGE{' '}
            </tspan>
            <tspan fill="#0D9488" fontWeight="800">
              TO{' '}
            </tspan>
            <tspan fill="#0F172A" fontWeight="800">
              SOLUTIONS
            </tspan>
          </text>

          <text
            x="588"
            y="195"
            textAnchor="start"
            fontFamily="Plus Jakarta Sans, Arial, sans-serif"
            fontSize="13"
            fontWeight="700"
            fill="#94A3B8"
            style={{
              fontFamily: "'Plus Jakarta Sans', Arial, sans-serif",
              fontSize: '13px',
              fontWeight: 700,
              letterSpacing: '2px',
            }}
          >
            S.R.L.
          </text>

          <line
            x1="260"
            y1="216"
            x2="440"
            y2="216"
            stroke="#CBD5E1"
            strokeWidth="1.5"
          />

          <text
            x="354"
            y="238"
            textAnchor="middle"
            fontFamily="Plus Jakarta Sans, Arial, sans-serif"
            fontSize="11"
            fontWeight="600"
            fill="#475569"
            style={{
              fontFamily: "'Plus Jakarta Sans', Arial, sans-serif",
              fontSize: '11px',
              fontWeight: 600,
              letterSpacing: '9px',
            }}
          >
            INTEGRATED SERVICES
          </text>
        </svg>
      </div>
    );
  }

  // 2. JUANA DE JESÚS • ATELIER
  if (brandId === 'atelier') {
    if (isThermal) {
      return (
        <div className={`inline-flex items-center justify-center bg-white mx-auto shrink-0 ${className}`}>
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 800 450"
            width={width}
            height={height}
            preserveAspectRatio="xMidYMid meet"
            style={{ display: 'block' }}
          >
            <rect width="800" height="450" fill="#FFFFFF" />

            <g transform="translate(400, 150)">
              <path
                d="M -22 -10 C -15 15, -12 25, -28 65 C -35 85, -45 105, -55 115 C -20 120, 20 120, 55 115 C 45 105, 35 85, 28 65 C 12 25, 15 15, 22 -10"
                fill="none"
                stroke="#000000"
                strokeWidth="4"
                strokeLinecap="round"
              />
              <path
                d="M -16 35 Q 0 40 16 35"
                fill="none"
                stroke="#000000"
                strokeWidth="4"
                strokeDasharray="4 2"
              />
              <path
                d="M 0 -70 C -35 -50, -40 -30, -22 -10"
                fill="none"
                stroke="#000000"
                strokeWidth="4"
                strokeLinecap="round"
              />
              <path
                d="M 0 -70 C 35 -50, 40 -30, 22 -10"
                fill="none"
                stroke="#000000"
                strokeWidth="4"
                strokeLinecap="round"
              />
              <path
                d="M 0 -95 L 4 -40 L 0 50 L -4 -40 Z"
                fill="#000000"
                stroke="#000000"
                strokeWidth="2"
              />
              <ellipse cx="0" cy="-70" rx="1.5" ry="5.5" fill="#FFFFFF" />
            </g>

            <text
              x="400"
              y="335"
              textAnchor="middle"
              fontFamily="Georgia, serif"
              fontSize="40"
              fontWeight="800"
              fill="#000000"
              style={{
                fontFamily: "'Bodoni Moda', Georgia, serif",
                fontSize: '40px',
                fontWeight: 800,
                fill: '#000000',
                letterSpacing: '8px',
              }}
            >
              JUANA DE JESÚS
            </text>
            <text
              x="400"
              y="385"
              textAnchor="middle"
              fontFamily="Arial, sans-serif"
              fontSize="22"
              fontWeight="800"
              fill="#000000"
              style={{
                fontFamily: "'Montserrat', Arial, sans-serif",
                fontSize: '22px',
                fontWeight: 800,
                fill: '#000000',
                letterSpacing: '14px',
              }}
            >
              • ATELIER •
            </text>
          </svg>
        </div>
      );
    }

    return (
      <div
        className={`inline-flex items-center justify-center shrink-0 rounded-xl bg-[#FAF9F6] border border-stone-200/90 p-1 ${className}`}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 800 500"
          width={width}
          height={height}
          preserveAspectRatio="xMidYMid meet"
          style={{ display: 'block' }}
        >
          <rect width="800" height="500" fill="#FAF9F6" rx="16" />

          <g transform="translate(400, 160)">
            <path
              d="M -22 -10 C -15 15, -12 25, -28 65 C -35 85, -45 105, -55 115 C -20 120, 20 120, 55 115 C 45 105, 35 85, 28 65 C 12 25, 15 15, 22 -10"
              fill="none"
              stroke="#B58A3E"
              strokeWidth="2.8"
              strokeLinecap="round"
            />
            <path
              d="M -16 35 Q 0 40 16 35"
              fill="none"
              stroke="#B58A3E"
              strokeWidth="2"
              strokeDasharray="3 2"
            />
            <path
              d="M 0 -70 C -35 -50, -40 -30, -22 -10"
              fill="none"
              stroke="#B58A3E"
              strokeWidth="2.4"
              strokeLinecap="round"
            />
            <path
              d="M 0 -70 C 35 -50, 40 -30, 22 -10"
              fill="none"
              stroke="#B58A3E"
              strokeWidth="2.4"
              strokeLinecap="round"
            />
            <path
              d="M 0 -95 L 3 -40 L 0 50 L -3 -40 Z"
              fill="#996515"
            />
            <ellipse cx="0" cy="-70" rx="1.3" ry="5.5" fill="#FAF9F6" />
          </g>

          <text
            x="406"
            y="340"
            textAnchor="middle"
            fontFamily="Bodoni Moda, Georgia, serif"
            fontSize="34"
            fontWeight="600"
            fill="#111111"
            style={{
              fontFamily: "'Bodoni Moda', Georgia, serif",
              fontSize: '34px',
              fontWeight: 600,
              letterSpacing: '12px',
            }}
          >
            JUANA DE JESÚS
          </text>
          <text
            x="409"
            y="385"
            textAnchor="middle"
            fontFamily="Montserrat, Arial, sans-serif"
            fontSize="16"
            fontWeight="600"
            fill="#B58A3E"
            style={{
              fontFamily: "'Montserrat', Arial, sans-serif",
              fontSize: '16px',
              fontWeight: 600,
              letterSpacing: '18px',
            }}
          >
            ATELIER
          </text>
        </svg>
      </div>
    );
  }

  // 3. SOLUCIONES BRITO Y METRO FOOD STATION (URL local sin crossOrigin="anonymous" y alto contraste en térmico)
  const imgSrc =
    brandId === 'sb-mantenimiento'
      ? '/logos/sb-logo.png'
      : '/logos/metro-logo.png';

  const altText =
    brandId === 'sb-mantenimiento' ? 'Soluciones Brito' : 'Metro Food Station';

  const imgWidth = isThermal
    ? 150
    : size === 'sm'
    ? 130
    : size === 'lg'
    ? 230
    : 180;
  const imgHeight = isThermal
    ? 56
    : size === 'sm'
    ? 52
    : size === 'lg'
    ? 96
    : 75;

  return (
    <div
      className={`inline-flex items-center justify-center shrink-0 ${
        isThermal
          ? 'bg-white mx-auto'
          : 'rounded-xl bg-white border border-slate-200/80 p-1.5'
      } ${className}`}
    >
      <img
        src={imgSrc}
        alt={altText}
        width={imgWidth}
        height={imgHeight}
        style={{
          objectFit: 'contain',
          width: `${imgWidth}px`,
          height: `${imgHeight}px`,
          display: 'block',
          ...(isThermal
            ? { filter: 'grayscale(100%) contrast(300%) brightness(0.8)' }
            : {}),
        }}
      />
    </div>
  );
};
