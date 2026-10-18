import { useQuery } from "@tanstack/react-query";
import { loadSharedReferenceData } from "@/lib/local-shared-data";

type SharedEquipmentIcons = {
  equipIcons?: Record<string, string>;
};

export function useEquipmentIcons() {
  const { data } = useQuery({
    queryKey: ["ka-reference"],
    queryFn: () => loadSharedReferenceData<SharedEquipmentIcons>(),
    staleTime: Infinity,
  });
  return data?.equipIcons ?? {};
}
