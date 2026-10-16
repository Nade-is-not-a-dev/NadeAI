"use client";

import { useState } from "react";
import PropTypes from "prop-types";
import { getProviderIconSrc, getIconCdnBase, markProviderIconMissing } from "@/shared/utils/providerIcon";

function resolveSrc(src, providerId) {
  if (providerId) return getProviderIconSrc(providerId);
  if (!src) return null;
  const m = String(src).match(/^\/providers\/([^/]+)\.png$/i);
  if (m) return getProviderIconSrc(m[1]);
  return src;
}

export default function ProviderIcon({
  src,
  providerId,
  alt,
  size = 32,
  className = "",
  fallbackText = "?",
  fallbackColor,
}) {
  const effectiveSrc = resolveSrc(src, providerId);
  const [errored, setErrored] = useState(false);
  // CDN mode: when a remote icon fails, retry the same icon on this server
  // before falling back to the text placeholder.
  const [localSrc, setLocalSrc] = useState(null);
  const displaySrc = localSrc || effectiveSrc;

  if (!displaySrc || errored) {
    return (
      <span
        className={`inline-flex items-center justify-center font-bold rounded-lg ${className}`.trim()}
        style={{
          width: size,
          height: size,
          color: fallbackColor,
          fontSize: Math.max(10, Math.floor(size * 0.38)),
        }}
      >
        {fallbackText}
      </span>
    );
  }

  return (
    <img
      src={displaySrc}
      alt={alt}
      width={size}
      height={size}
      className={className}
      loading="lazy"
      decoding="async"
      onError={() => {
        const cdnBase = getIconCdnBase();
        if (cdnBase && !localSrc && String(displaySrc).startsWith(`${cdnBase}/`)) {
          setLocalSrc(String(displaySrc).slice(cdnBase.length));
          return;
        }
        const m = String(displaySrc).match(/^\/providers\/([^/]+)\.(png|svg)$/i);
        if (m) markProviderIconMissing(m[1]);
        if (providerId) markProviderIconMissing(providerId);
        setErrored(true);
      }}
    />
  );
}

ProviderIcon.propTypes = {
  src: PropTypes.string,
  providerId: PropTypes.string,
  alt: PropTypes.string,
  size: PropTypes.number,
  className: PropTypes.string,
  fallbackText: PropTypes.string,
  fallbackColor: PropTypes.string,
};
