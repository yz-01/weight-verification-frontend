"use client";

import { useCallback, useEffect, useState } from "react";

export type DevicePermissionStatus =
  | PermissionState
  | "unknown"
  | "unsupported";

export function useDriverDeviceStatus() {
  const [gpsStatus, setGpsStatus] =
    useState<DevicePermissionStatus>("unknown");
  const [cameraStatus, setCameraStatus] =
    useState<DevicePermissionStatus>("unknown");

  useEffect(() => {
    const listeners: Array<() => void> = [];
    if (!("geolocation" in navigator)) {
      const timeout = window.setTimeout(() => setGpsStatus("unsupported"), 0);
      listeners.push(() => window.clearTimeout(timeout));
    }
    if (!("mediaDevices" in navigator) || !navigator.mediaDevices.getUserMedia) {
      const timeout = window.setTimeout(
        () => setCameraStatus("unsupported"),
        0,
      );
      listeners.push(() => window.clearTimeout(timeout));
    }

    if (navigator.permissions?.query) {
      void navigator.permissions
        .query({ name: "geolocation" })
        .then((permission) => {
          const update = () => setGpsStatus(permission.state);
          update();
          permission.addEventListener("change", update);
          listeners.push(() => permission.removeEventListener("change", update));
        })
        .catch(() => undefined);
      void navigator.permissions
        .query({ name: "camera" as PermissionName })
        .then((permission) => {
          const update = () => setCameraStatus(permission.state);
          update();
          permission.addEventListener("change", update);
          listeners.push(() => permission.removeEventListener("change", update));
        })
        .catch(() => undefined);
    }
    return () => listeners.forEach((remove) => remove());
  }, []);

  const requestGps = useCallback(async () => {
    if (!("geolocation" in navigator)) {
      setGpsStatus("unsupported");
      return false;
    }
    return new Promise<boolean>((resolve) => {
      navigator.geolocation.getCurrentPosition(
        () => {
          setGpsStatus("granted");
          resolve(true);
        },
        () => {
          setGpsStatus("denied");
          resolve(false);
        },
        { enableHighAccuracy: true, timeout: 15_000, maximumAge: 0 },
      );
    });
  }, []);

  const testCamera = useCallback(async () => {
    if (!("mediaDevices" in navigator) || !navigator.mediaDevices.getUserMedia) {
      setCameraStatus("unsupported");
      return false;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
        audio: false,
      });
      stream.getTracks().forEach((track) => track.stop());
      setCameraStatus("granted");
      return true;
    } catch {
      setCameraStatus("denied");
      return false;
    }
  }, []);

  return { gpsStatus, cameraStatus, requestGps, testCamera };
}
