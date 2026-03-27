import React from 'react';

type AmyState = 'idle' | 'happy' | 'think' | 'confused' | 'loading' | 'done';

interface AmyIconProps {
  state?: AmyState;
  size?: number;
  className?: string;
  style?: React.CSSProperties;
}

export const AmyIcon: React.FC<AmyIconProps> = ({
  state = 'idle',
  size = 24,
  className,
  style,
}) => {
  const s = size;
  const sw = Math.max(1, s * 0.055);
  const rx = s * 0.15;

  const eyes = (y: number) => (
    <>
      <rect x={s*0.28} y={y} width={s*0.13} height={s*0.13}
        rx={s*0.03} fill="currentColor"/>
      <rect x={s*0.59} y={y} width={s*0.13} height={s*0.13}
        rx={s*0.03} fill="currentColor"/>
    </>
  );

  const shell = (opacity = 1) => (
    <rect x={s*0.12} y={s*0.12} width={s*0.76} height={s*0.76}
      rx={rx} stroke="currentColor" strokeWidth={sw}
      fill="none" opacity={opacity}/>
  );

  const renderFace = () => {
    switch (state) {
      case 'idle':
        return (<>
          {shell()}
          {eyes(s*0.36)}
          <line x1={s*0.34} y1={s*0.65} x2={s*0.66} y2={s*0.65}
            stroke="currentColor" strokeWidth={sw} strokeLinecap="round"/>
        </>);
      case 'happy':
        return (<>
          {shell()}
          <path d={`M${s*.27} ${s*.42}L${s*.34} ${s*.35}L${s*.41} ${s*.42}`}
            stroke="currentColor" strokeWidth={sw} strokeLinecap="round"
            strokeLinejoin="round" fill="none"/>
          <path d={`M${s*.59} ${s*.42}L${s*.66} ${s*.35}L${s*.73} ${s*.42}`}
            stroke="currentColor" strokeWidth={sw} strokeLinecap="round"
            strokeLinejoin="round" fill="none"/>
          <path d={`M${s*.28} ${s*.62}Q${s*.5} ${s*.78}${s*.72} ${s*.62}`}
            stroke="currentColor" strokeWidth={sw} strokeLinecap="round"
            fill="none"/>
        </>);
      case 'think':
        return (<>
          {shell()}
          {eyes(s*0.35)}
          <path d={`M${s*.28} ${s*.62}Q${s*.36} ${s*.54}${s*.44} ${s*.62}
            Q${s*.52} ${s*.70}${s*.60} ${s*.62}Q${s*.66} ${s*.56}${s*.72} ${s*.62}`}
            stroke="currentColor" strokeWidth={sw*0.85}
            strokeLinecap="round" fill="none"/>
        </>);
      case 'confused':
        return (<>
          {shell()}
          <path d={`M${s*.27} ${s*.37}L${s*.34} ${s*.30}L${s*.41} ${s*.37}`}
            stroke="currentColor" strokeWidth={sw} strokeLinecap="round"
            strokeLinejoin="round" fill="none"/>
          {eyes(s*0.44)}
          <line x1={s*0.34} y1={s*0.68} x2={s*0.66} y2={s*0.68}
            stroke="currentColor" strokeWidth={sw} strokeLinecap="round"/>
        </>);
      case 'loading':
        return (<>
          {shell(0.3)}
          <rect x={s*0.18} y={s*0.18} width={s*0.64} height={s*0.64}
            rx={rx*0.7} fill="none" stroke="currentColor" strokeWidth={sw}
            strokeDasharray={`${s*0.22} ${s*0.78}`} strokeLinecap="round"
            style={{transformBox:'fill-box',transformOrigin:'center',
              animation:'amyIconSpin .9s linear infinite'}}/>
          <rect x={s*0.36} y={s*0.36} width={s*0.28} height={s*0.28}
            rx={s*0.06} fill="none" stroke="currentColor"
            strokeWidth={sw*0.8} opacity={0.4}/>
        </>);
      case 'done':
        return (<>
          {shell()}
          <path d={`M${s*.26} ${s*.5}L${s*.44} ${s*.68}L${s*.74} ${s*.33}`}
            stroke="currentColor" strokeWidth={sw*1.3}
            strokeLinecap="round" strokeLinejoin="round" fill="none"/>
        </>);
    }
  };

  return (
    <>
      <style>{`
        @keyframes amyIconSpin { to { transform: rotate(360deg); } }
      `}</style>
      <svg width={s} height={s} viewBox={`0 0 ${s} ${s}`}
        fill="none" xmlns="http://www.w3.org/2000/svg"
        className={className} style={style}>
        {renderFace()}
      </svg>
    </>
  );
};

export default AmyIcon;
