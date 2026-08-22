import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import AmbientIdentityField from "@/components/AmbientIdentityField";
import { AlertCircle, Home } from "lucide-react";
import { useLocation } from "wouter";

export default function NotFound() {
  const [, setLocation] = useLocation();

  const handleGoHome = () => {
    setLocation("/");
  };

  return (
    <div className="samvid-shell relative min-h-screen w-full flex items-center justify-center overflow-hidden"><AmbientIdentityField intensity={.45} variant="auth" />
      <Card className="panel relative z-10 w-full max-w-lg mx-4 rounded-3xl">
        <CardContent className="pt-8 pb-8 text-center">
          <div className="flex justify-center mb-6">
            <div className="relative">
              <div className="absolute inset-0 bg-red-100 rounded-full animate-pulse" />
              <AlertCircle className="relative h-16 w-16 text-[#EC4899]" />
            </div>
          </div>

          <h1 className="display mb-2 text-5xl font-bold text-[#172554]">404</h1>

          <h2 className="display mb-4 text-2xl font-semibold text-[#172554]">
            Page Not Found
          </h2>

          <p className="mb-8 text-base leading-relaxed text-[#64748B]">
            Sorry, the page you are looking for doesn't exist.
            <br />
            It may have been moved or deleted.
          </p>

          <div
            id="not-found-button-group"
            className="flex flex-col sm:flex-row gap-3 justify-center"
          >
            <Button
              onClick={handleGoHome}
              className="aurora-cta rounded-full px-6 py-3 text-sm font-semibold text-white"
            >
              <Home className="w-4 h-4 mr-2" />
              Go Home
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
