'use client';
import React, { useState } from 'react';

interface Props {
  onClose: () => void;
}

export default function AboutDialog({ onClose }: Props) {
  const [logoOk, setLogoOk] = useState(true);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.6)' }}>
      <div className="panel w-[480px] max-h-[85vh] flex flex-col" style={{ background: 'var(--bg-secondary)' }}>
        <div className="panel-header flex justify-between items-center">
          <span>About Section Designer</span>
          <button className="text-sm hover:opacity-70" onClick={onClose}>✕</button>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {/* App Info */}
          <div className="flex items-center gap-4 mb-6">
            <div
              className="w-16 h-16 rounded-xl flex items-center justify-center font-extrabold text-2xl shrink-0 overflow-hidden"
              style={{ background: 'var(--accent)' }}
            >
              {logoOk ? (
                // Project logo asset — replace public/logo.svg to rebrand
                // eslint-disable-next-line @next/next/no-img-element
                <img src="/logo.svg" alt="Section Designer" className="w-16 h-16 object-contain" onError={() => setLogoOk(false)} />
              ) : (
                'SD'
              )}
            </div>
            <div>
              <h2 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>Section Designer</h2>
              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Draw · Analyse · Design</p>
              <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>Version 1.0.0</p>
            </div>
          </div>

          <div className="mb-6 p-4 rounded-lg" style={{ background: 'var(--bg-primary)', border: '1px solid var(--border)' }}>
            <p className="text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
              A professional structural section analysis & property designer for engineers. 
              Create standard and custom structural sections, calculate geometric properties, 
              and generate engineering reports.
            </p>
          </div>

          {/* About Author */}
          <div className="mb-4">
            <h3 className="text-xs font-bold uppercase tracking-wider mb-3" style={{ color: 'var(--text-muted)' }}>
              About the Author
            </h3>
            
            <div className="p-4 rounded-lg" style={{ background: 'var(--bg-primary)', border: '1px solid var(--border)' }}>
              <div className="flex items-start gap-4">
                <div 
                  className="w-14 h-14 rounded-full flex items-center justify-center text-xl font-bold shrink-0"
                  style={{ background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)', color: 'white' }}
                >
                  AR
                </div>
                <div className="flex-1">
                  <h4 className="font-bold text-base" style={{ color: 'var(--text-primary)' }}>
                    Arvind Singh Rawat
                  </h4>
                  <p className="text-sm italic mb-2" style={{ color: 'var(--accent)' }}>
                    Bridge & Structural Design Engineer
                  </p>
                  <p className="text-sm leading-relaxed mb-3" style={{ color: 'var(--text-secondary)' }}>
                    Structural engineer with <strong>8+ years of experience</strong> in RCC, PSC and steel bridge design. 
                    Passionate about combining <strong>structural engineering, design codes and software development</strong> to 
                    create practical, transparent and reliable engineering tools.
                  </p>
                  
                  <div className="flex flex-col gap-1.5">
                    <a 
                      href="mailto:arvindrawat400@gmail.com" 
                      className="text-sm flex items-center gap-2 hover:underline"
                      style={{ color: 'var(--accent)' }}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
                        <polyline points="22,6 12,13 2,6"/>
                      </svg>
                      arvindrawat400@gmail.com
                    </a>
                    <a 
                      href="https://linkedin.com/in/arvindrawat400" 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="text-sm flex items-center gap-2 hover:underline"
                      style={{ color: 'var(--accent)' }}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
                      </svg>
                      linkedin.com/in/arvindrawat400
                    </a>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Features */}
          <div className="mb-4">
            <h3 className="text-xs font-bold uppercase tracking-wider mb-2" style={{ color: 'var(--text-muted)' }}>
              Key Features
            </h3>
            <ul className="text-sm space-y-1" style={{ color: 'var(--text-secondary)' }}>
              <li>• Standard & custom section geometry</li>
              <li>• Interactive 2D canvas with pan/zoom</li>
              <li>• Real-time property calculations</li>
              <li>• Boolean operations (add/subtract)</li>
              <li>• Calculation trace & QA validation</li>
              <li>• PDF, CSV, JSON export</li>
            </ul>
          </div>
        </div>

        <div className="p-4 border-t text-center" style={{ borderColor: 'var(--border)' }}>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
            © 2025 Arvind Singh Rawat. All Rights Reserved.
          </p>
          <button className="btn btn-primary mt-3 px-8" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
