"use client";

import { useRef, useEffect } from "react";

/** Decode a Google encoded polyline string into [lat, lng] pairs */
function decodePolyline(encoded: string): [number, number][] {
  const points: [number, number][] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;

  while (index < encoded.length) {
    let shift = 0;
    let result = 0;
    let byte: number;

    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);

    lat += result & 1 ? ~(result >> 1) : result >> 1;

    shift = 0;
    result = 0;

    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);

    lng += result & 1 ? ~(result >> 1) : result >> 1;

    points.push([lat / 1e5, lng / 1e5]);
  }

  return points;
}

interface RouteMapProps {
  polyline: string;
  className?: string;
}

export function RouteMap({ polyline, className }: RouteMapProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const points = decodePolyline(polyline);
    if (points.length < 2) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = container.getBoundingClientRect();
    const width = rect.width;
    const height = rect.height;

    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.scale(dpr, dpr);

    // Find bounds
    let minLat = Infinity, maxLat = -Infinity;
    let minLng = Infinity, maxLng = -Infinity;
    for (const [lat, lng] of points) {
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
      if (lng < minLng) minLng = lng;
      if (lng > maxLng) maxLng = lng;
    }

    const padding = 20;
    const drawWidth = width - padding * 2;
    const drawHeight = height - padding * 2;

    const latRange = maxLat - minLat || 0.001;
    const lngRange = maxLng - minLng || 0.001;

    // Maintain aspect ratio using Mercator-like scaling
    const midLat = (minLat + maxLat) / 2;
    const latCos = Math.cos((midLat * Math.PI) / 180);
    const scaledLngRange = lngRange * latCos;

    const scaleX = drawWidth / scaledLngRange;
    const scaleY = drawHeight / latRange;
    const scale = Math.min(scaleX, scaleY);

    const totalW = scaledLngRange * scale;
    const totalH = latRange * scale;
    const offsetX = padding + (drawWidth - totalW) / 2;
    const offsetY = padding + (drawHeight - totalH) / 2;

    function project(lat: number, lng: number): [number, number] {
      const x = offsetX + (lng - minLng) * latCos * scale;
      const y = offsetY + (maxLat - lat) * scale;
      return [x, y];
    }

    // Clear
    ctx.clearRect(0, 0, width, height);

    // Draw glow
    ctx.strokeStyle = "rgba(200, 252, 3, 0.15)";
    ctx.lineWidth = 6;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    const [gx0, gy0] = project(points[0][0], points[0][1]);
    ctx.moveTo(gx0, gy0);
    for (let i = 1; i < points.length; i++) {
      const [gx, gy] = project(points[i][0], points[i][1]);
      ctx.lineTo(gx, gy);
    }
    ctx.stroke();

    // Draw route
    ctx.strokeStyle = "#C8FC03";
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    const [x0, y0] = project(points[0][0], points[0][1]);
    ctx.moveTo(x0, y0);
    for (let i = 1; i < points.length; i++) {
      const [x, y] = project(points[i][0], points[i][1]);
      ctx.lineTo(x, y);
    }
    ctx.stroke();

    // Start dot
    ctx.fillStyle = "#22C55E";
    ctx.beginPath();
    ctx.arc(x0, y0, 4, 0, Math.PI * 2);
    ctx.fill();

    // End dot
    const [xEnd, yEnd] = project(points[points.length - 1][0], points[points.length - 1][1]);
    ctx.fillStyle = "#EF4444";
    ctx.beginPath();
    ctx.arc(xEnd, yEnd, 4, 0, Math.PI * 2);
    ctx.fill();
  }, [polyline]);

  return (
    <div ref={containerRef} className={className} style={{ minHeight: 0 }}>
      <canvas ref={canvasRef} className="w-full h-full" />
    </div>
  );
}
