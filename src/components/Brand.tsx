export function BrandFooter({ className = "" }: { className?: string }) {
  return (
    <p className={`text-xs text-muted-foreground/70 text-center ${className}`}>
      Stworzone przez <span className="font-medium">AutoSafe</span>
    </p>
  );
}