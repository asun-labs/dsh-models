import React from 'react'

function AssetSketch({ kind }) {
  return <svg viewBox="0 0 100 100" fill="none" aria-hidden="true">
    {kind === 'home' ? <g stroke="currentColor" strokeWidth="4" strokeLinejoin="round">
      <path d="M22 58V39q0-8 8-8h40q8 0 8 8v19" fill="currentColor" fillOpacity=".22" />
      <path d="M17 53q0-5 5-5t5 5v10h46V53q0-5 5-5t5 5v19H17V53Z" fill="currentColor" fillOpacity=".5" />
      <path d="M25 73v9m50-9v9M50 34v26" />
    </g> : kind === 'devices' ? <g stroke="currentColor" strokeWidth="4" strokeLinejoin="round">
      <rect x="17" y="20" width="66" height="47" rx="5" fill="currentColor" fillOpacity=".2" /><path d="M42 68v12m16-12v12M30 82h40M24 57h52" />
      <path d="m43 34-7 7 7 7m14-14 7 7-7 7" />
    </g> : <g stroke="currentColor" strokeWidth="3.5" strokeLinejoin="round">
      <path d="M51 14C35 28 32 46 32 66l19 9 19-9c0-20-3-38-19-52Z" fill="currentColor" fillOpacity=".3" />
      <circle cx="51" cy="42" r="8" /><path d="m32 51-13 17v15l16-12m35-20 13 17v15L67 71M44 78l7 14 7-14" />
    </g>}
  </svg>
}

export function AssetBillboard({ count, sourceCount }) {
  return <header className="seal-assets-billboard">
    <div className="seal-assets-hero-copy">
      <span className="seal-assets-eyebrow"><i /> DSH MODELS <span>/ OPEN ASSET INDEX</span></span>
      <h1>资产库</h1>
      <h2>让灵感，<br />拥有形状<span>。</span></h2>
      <p>从一把椅子，到浩瀚宇宙。<br />发现创作所需，把好资产带进你的工作区。</p>
      <div className="seal-assets-hero-stats"><span><b>{count.toLocaleString()}</b> 资产索引</span><span><b>{sourceCount}</b> 资源来源</span><span>开放资源 · 来源可溯</span></div>
    </div>
    <div className="seal-assets-hero-art" aria-hidden="true">
      <div className="seal-assets-orbit" /><div className="seal-assets-orbit second" />
      <div className="seal-assets-float furniture"><AssetSketch kind="home" /><span>LIVE / 家装</span></div>
      <div className="seal-assets-float monitor"><AssetSketch kind="devices" /><span>MAKE / 设备</span></div>
      <div className="seal-assets-float rocket"><AssetSketch kind="equipment" /><span>EXPLORE / 装备</span></div>
      <span className="seal-assets-art-label">A WORLD OF POSSIBILITIES</span>
    </div>
  </header>
}
