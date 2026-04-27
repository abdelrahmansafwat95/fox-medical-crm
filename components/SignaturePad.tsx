"use client";

import { useEffect, useRef, useState, forwardRef, useImperativeHandle } from "react";
import { Eraser } from "lucide-react";

export interface SignaturePadHandle {
  /** Returns base64 data URL or null if blank */
  toDataURL: () => string | null;
  /** Clears the canvas */
  clear: () => void;
  /** Whether anything has been drawn */
  isEmpty: () => boolean;
}

interface Props {
  height?: number;
  className?: string;
}

/**
 * Touch + mouse signature pad. Draws on a fixed-DPR canvas so signatures
 * stay sharp on retina displays. Designed for mobile use.
 */
const SignaturePad = forwardRef<SignaturePadHandle, Props>(function SignaturePad(
  { height = 180, className = "" },
  ref
) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawingRef = useRef(false);
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);
  const hasDrawnRef = useRef(false);
  const [, setRender] = useState(0); // force re-render so "Clear" button reflects state

  // Setup high-DPI canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.scale(dpr, dpr);
      ctx.lineWidth = 2.2;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.strokeStyle = "#0f172a";
    }
  }, []);

  function getPoint(e: PointerEvent | React.PointerEvent) {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function start(e: React.PointerEvent<HTMLCanvasElement>) {
    e.preventDefault();
    const canvas = canvasRef.current!;
    canvas.setPointerCapture(e.pointerId);
    drawingRef.current = true;
    lastPointRef.current = getPoint(e);
  }

  function move(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawingRef.current) return;
    e.preventDefault();
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const p = getPoint(e);
    const last = lastPointRef.current;
    if (last) {
      ctx.beginPath();
      ctx.moveTo(last.x, last.y);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
      hasDrawnRef.current = true;
    }
    lastPointRef.current = p;
  }

  function end(e: React.PointerEvent<HTMLCanvasElement>) {
    drawingRef.current = false;
    lastPointRef.current = null;
    setRender((n) => n + 1);
    try {
      canvasRef.current?.releasePointerCapture(e.pointerId);
    } catch {
      // pointer may already be released
    }
  }

  function clear() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    hasDrawnRef.current = false;
    setRender((n) => n + 1);
  }

  useImperativeHandle(ref, () => ({
    toDataURL: () => {
      if (!hasDrawnRef.current) return null;
      return canvasRef.current?.toDataURL("image/png") ?? null;
    },
    clear,
    isEmpty: () => !hasDrawnRef.current
  }));

  return (
    <div className={`relative ${className}`}>
      <canvas
        ref={canvasRef}
        style={{ height, width: "100%", touchAction: "none" }}
        className="block bg-white border-2 border-dashed border-slate-300 rounded-lg cursor-crosshair"
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={end}
        onPointerCancel={end}
      />
      {!hasDrawnRef.current && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <span className="text-sm text-slate-400">Sign here</span>
        </div>
      )}
      <button
        type="button"
        onClick={clear}
        className="absolute top-2 right-2 text-xs px-2 py-1 rounded bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 inline-flex items-center gap-1"
      >
        <Eraser className="w-3 h-3" /> Clear
      </button>
    </div>
  );
});

export default SignaturePad;
