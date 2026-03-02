import { MapPin } from "lucide-react";

export function MapLoadingFallback() {
  return (
    <div className="h-screen w-full flex items-center justify-center bg-gray-50">
      <div className="text-center">
        {/* Nexamap Logo Loading Animation */}
        <div className="mb-6">
          <img 
            src="https://cdn.builder.io/api/v1/image/assets%2F0df748b9b86d4bc5af1be6fda4f6f0d0%2F9fbd34283535421db2163a3b996c4e11?format=webp&width=800" 
            alt="Nexamap Logo" 
            className="h-16 w-auto object-contain mx-auto animate-pulse"
          />
        </div>
        
        {/* Loading Content */}
        <div className="space-y-4">
          <div className="flex items-center justify-center space-x-2">
            <MapPin className="w-5 h-5 text-nexamap-500 animate-bounce" />
            <h2 className="text-xl font-semibold text-gray-800">Loading Nexamap</h2>
          </div>
          
          <p className="text-gray-600 max-w-md mx-auto">
            Initializing map components and loading geospatial tools...
          </p>
          
          {/* Loading Progress Animation */}
          <div className="w-64 mx-auto bg-gray-200 rounded-full h-2 overflow-hidden">
            <div className="h-full bg-gradient-to-r from-nexamap-500 to-nexamap-600 rounded-full animate-pulse"></div>
          </div>
        </div>
      </div>
    </div>
  );
}
