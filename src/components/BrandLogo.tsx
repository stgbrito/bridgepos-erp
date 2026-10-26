import React from 'react';
import { type BrandId } from '../db/db';

declare global {
  interface ImportMeta {
    env: {
      BASE_URL?: string;
      [key: string]: unknown;
    };
  }
}

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
    variant === 'thermal' ? { width: 210, height: 80 } : PIXEL_DIMENSIONS[size];

  const isThermal = variant === 'thermal';

  // 1. BRIDGE TO SOLUTIONS (100% transparente sin <rect> de fondo ni bordes de contenedor)
  if (brandId === 'bridge-tech') {
    if (isThermal) {
      return (
        <div
          className={`inline-flex items-center justify-center mx-auto shrink-0 ${className}`}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 700 270"
            width={width}
            height={height}
            preserveAspectRatio="xMidYMid meet"
            style={{ display: 'block' }}
          >
            <g transform="translate(350, 92)">
              <rect
                x="-110"
                y="38"
                width="220"
                height="12"
                rx="3"
                fill="#000000"
              />
              <rect
                x="-92"
                y="-20"
                width="24"
                height="62"
                rx="3"
                fill="#000000"
              />
              <rect
                x="68"
                y="-20"
                width="24"
                height="62"
                rx="3"
                fill="#000000"
              />
              <path
                d="M -90 12 C -48 -45, 48 -45, 90 12"
                fill="none"
                stroke="#000000"
                strokeWidth="14"
                strokeLinecap="round"
              />
              <path
                d="M -66 22 C -35 -20, 35 -20, 66 22"
                fill="none"
                stroke="#000000"
                strokeWidth="10"
                strokeLinecap="round"
              />
              <path
                d="M -42 30 C -20 0, 20 0, 42 30"
                fill="none"
                stroke="#000000"
                strokeWidth="7"
                strokeLinecap="round"
              />
              <circle cx="-81" cy="-20" r="7" fill="#000000" />
              <circle cx="81" cy="-20" r="7" fill="#000000" />
            </g>

            <text
              x="350"
              y="196"
              textAnchor="middle"
              fontFamily="Arial, sans-serif"
              fontSize="40"
              fontWeight="800"
              fill="#000000"
              style={{
                fontFamily: "'Plus Jakarta Sans', Arial, sans-serif",
                fontSize: '40px',
                fontWeight: 800,
                fill: '#000000',
                letterSpacing: '2px',
              }}
            >
              BRIDGE TO SOLUTIONS
            </text>

            <line
              x1="200"
              y1="214"
              x2="500"
              y2="214"
              stroke="#000000"
              strokeWidth="4"
            />

            <text
              x="350"
              y="245"
              textAnchor="middle"
              fontFamily="Arial, sans-serif"
              fontSize="18"
              fontWeight="800"
              fill="#000000"
              style={{
                fontFamily: "'Plus Jakarta Sans', Arial, sans-serif",
                fontSize: '18px',
                fontWeight: 800,
                fill: '#000000',
                letterSpacing: '6px',
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
        className={`inline-flex items-center justify-center shrink-0 ${className}`}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 700 290"
          width={width}
          height={height}
          preserveAspectRatio="xMidYMid meet"
          style={{ display: 'block' }}
        >
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

  // 2. JUANA DE JESÚS • ATELIER (100% transparente en default y trazos gruesos 14px en thermal)
  if (brandId === 'atelier') {
    if (isThermal) {
      return (
        <div
          className={`inline-flex items-center justify-center mx-auto shrink-0 ${className}`}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 800 450"
            width={width}
            height={height}
            preserveAspectRatio="xMidYMid meet"
            style={{ display: 'block' }}
          >
            <g transform="translate(400, 145)">
              <path
                d="M -22 -10 C -15 15, -12 25, -28 65 C -35 85, -45 105, -55 115 C -20 120, 20 120, 55 115 C 45 105, 35 85, 28 65 C 12 25, 15 15, 22 -10"
                fill="none"
                stroke="#000000"
                strokeWidth="14"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M -16 35 Q 0 40 16 35"
                fill="none"
                stroke="#000000"
                strokeWidth="14"
                strokeLinecap="round"
              />
              <path
                d="M 0 -70 C -35 -50, -40 -30, -22 -10"
                fill="none"
                stroke="#000000"
                strokeWidth="14"
                strokeLinecap="round"
              />
              <path
                d="M 0 -70 C 35 -50, 40 -30, 22 -10"
                fill="none"
                stroke="#000000"
                strokeWidth="14"
                strokeLinecap="round"
              />
              <path
                d="M 0 -95 L 9 -40 L 0 55 L -9 -40 Z"
                fill="#000000"
                stroke="#000000"
                strokeWidth="4"
              />
              <ellipse cx="0" cy="-70" rx="2.5" ry="6.5" fill="#FFFFFF" />
            </g>

            <text
              x="400"
              y="335"
              textAnchor="middle"
              fontFamily="Georgia, serif"
              fontSize="52"
              fontWeight="800"
              fill="#000000"
              style={{
                fontFamily: "'Bodoni Moda', Georgia, serif",
                fontSize: '52px',
                fontWeight: 800,
                fill: '#000000',
                letterSpacing: '6px',
              }}
            >
              JUANA DE JESÚS
            </text>
            <text
              x="400"
              y="392"
              textAnchor="middle"
              fontFamily="Arial, sans-serif"
              fontSize="28"
              fontWeight="800"
              fill="#000000"
              style={{
                fontFamily: "'Montserrat', Arial, sans-serif",
                fontSize: '28px',
                fontWeight: 800,
                fill: '#000000',
                letterSpacing: '12px',
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
        className={`inline-flex items-center justify-center shrink-0 ${className}`}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 800 500"
          width={width}
          height={height}
          preserveAspectRatio="xMidYMid meet"
          style={{ display: 'block' }}
        >
          <g transform="translate(400, 160)">
            <path
              d="M -22 -10 C -15 15, -12 25, -28 65 C -35 85, -45 105, -55 115 C -20 120, 20 120, 55 115 C 45 105, 35 85, 28 65 C 12 25, 15 15, 22 -10"
              fill="none"
              stroke="#B58A3E"
              strokeWidth="3.2"
              strokeLinecap="round"
            />
            <path
              d="M -16 35 Q 0 40 16 35"
              fill="none"
              stroke="#B58A3E"
              strokeWidth="2.4"
              strokeDasharray="3 2"
            />
            <path
              d="M 0 -70 C -35 -50, -40 -30, -22 -10"
              fill="none"
              stroke="#B58A3E"
              strokeWidth="2.6"
              strokeLinecap="round"
            />
            <path
              d="M 0 -70 C 35 -50, 40 -30, 22 -10"
              fill="none"
              stroke="#B58A3E"
              strokeWidth="2.6"
              strokeLinecap="round"
            />
            <path
              d="M 0 -95 L 3.5 -40 L 0 50 L -3.5 -40 Z"
              fill="#996515"
            />
            <ellipse cx="0" cy="-70" rx="1.3" ry="5.5" fill="#FFFFFF" />
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

  // 3. SOLUCIONES BRITO Y METRO FOOD STATION
  const imgSrc =
    brandId === 'sb-mantenimiento'
      ? `${import.meta.env.BASE_URL}logos/sb-logo.png`
      : `${import.meta.env.BASE_URL}logos/metro-logo.png`;

  const altText =
    brandId === 'sb-mantenimiento' ? 'Soluciones Brito' : 'Metro Food Station';

  const imgWidth = isThermal
    ? 210
    : size === 'sm'
    ? 130
    : size === 'lg'
    ? 230
    : 180;
  const imgHeight = isThermal
    ? 80
    : size === 'sm'
    ? 52
    : size === 'lg'
    ? 96
    : 75;

  return (
    <div
      className={`inline-flex items-center justify-center shrink-0 ${
        isThermal ? 'mx-auto bg-white' : ''
      } ${className}`}
      style={isThermal ? { backgroundColor: '#FFFFFF' } : undefined}
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
          backgroundColor: '#FFFFFF',
          ...(isThermal
            ? {
                filter: 'grayscale(100%) contrast(250%) brightness(1.15)',
                mixBlendMode: 'multiply',
              }
            : {}),
        }}
      />
    </div>
  );
};
