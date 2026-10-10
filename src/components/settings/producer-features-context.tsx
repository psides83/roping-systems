"use client";
import { createContext, useContext } from "react";
import type { ProducerFeatures } from "@/lib/producer-features";
export const ProducerFeaturesContext = createContext<ProducerFeatures>({});
export function ProducerFeaturesProvider({ features, children }: { features: ProducerFeatures; children: React.ReactNode }) {
  return <ProducerFeaturesContext.Provider value={features}>{children}</ProducerFeaturesContext.Provider>;
}
export function useProducerFeatures() { return useContext(ProducerFeaturesContext); }
