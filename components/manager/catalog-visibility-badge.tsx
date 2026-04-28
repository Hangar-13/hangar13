import {
  catalogVisibilityBadgeClassName,
  catalogVisibilityTitle,
  type CatalogVisibility,
} from "@/lib/catalog-visibility";
import { cn } from "@/lib/utils";

type Props = {
  visibility: CatalogVisibility;
  className?: string;
};

export function CatalogVisibilityBadge({ visibility, className }: Props) {
  return (
    <span
      className={cn(catalogVisibilityBadgeClassName(visibility), className)}
    >
      {catalogVisibilityTitle(visibility)}
    </span>
  );
}
