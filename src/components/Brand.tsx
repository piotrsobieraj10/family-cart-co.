import { APP_AUTHOR_TEXT, APP_NAME, APP_VERSION } from "@/config/app";

export function AppIdentity({ className = "" }: { className?: string }) {
  return (
    <div className={`text-center ${className}`}>
      <div className="font-semibold text-foreground">{APP_NAME}</div>
      <div className="text-sm text-muted-foreground">Version: {APP_VERSION}</div>
      <div className="text-sm text-muted-foreground">{APP_AUTHOR_TEXT}</div>
    </div>
  );
}

export function BrandFooter({ className = "" }: { className?: string }) {
  return (
    <div className={`text-xs text-muted-foreground/70 text-center space-y-0.5 ${className}`}>
      <div>{APP_NAME}</div>
      <div>Version: {APP_VERSION}</div>
      <div>{APP_AUTHOR_TEXT}</div>
    </div>
  );
}
