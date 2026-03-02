import { X, MapPin, DollarSign, Home, Phone } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";

export interface Listing {
  id: string;
  address: string;
  suburb: string;
  state: string;
  postcode: string;
  price: string;
  propertyType: string;
  bedrooms?: number;
  bathrooms?: number;
  parking?: number;
  landSize?: string;
  agentName: string;
  agentPhone: string;
  url: string;
  imageUrl?: string;
  coordinates?: {
    lat: number;
    lng: number;
  };
  underOffer?: boolean;
  extractedAt: string;
}

interface RealEstateListingsSidebarProps {
  listings: Listing[];
  isOpen: boolean;
  onClose: () => void;
  selectedListingId?: string;
  onSelectListing?: (listing: Listing) => void;
  isLoading?: boolean;
}

export function RealEstateListingsSidebar({
  listings,
  isOpen,
  onClose,
  selectedListingId,
  onSelectListing,
  isLoading = false,
}: RealEstateListingsSidebarProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed right-0 top-0 h-screen w-96 bg-white shadow-xl z-30 border-l border-gray-200 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-200">
        <div>
          <h3 className="text-lg font-bold">Listings</h3>
          <p className="text-sm text-gray-500">
            {listings.length} properties found
          </p>
        </div>
        <button
          onClick={onClose}
          className="p-2 hover:bg-gray-100 rounded-lg transition"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Listings List */}
      <ScrollArea className="flex-1">
        {isLoading ? (
          <div className="p-4 text-center text-gray-500">
            <div className="animate-spin inline-block w-8 h-8 border-4 border-gray-300 border-t-blue-600 rounded-full"></div>
            <p className="mt-2">Loading listings...</p>
          </div>
        ) : listings.length === 0 ? (
          <div className="p-4 text-center text-gray-500">
            <Home className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p>No listings found. Try adjusting your filters.</p>
          </div>
        ) : (
          <div className="p-3 space-y-3">
            {listings.map((listing) => (
              <div
                key={listing.id}
                onClick={() => onSelectListing?.(listing)}
                className={`p-4 border-2 rounded-lg cursor-pointer transition ${
                  selectedListingId === listing.id
                    ? "border-blue-600 bg-blue-50"
                    : "border-gray-200 hover:border-gray-300 hover:bg-gray-50"
                }`}
              >
                {/* Address */}
                <div className="flex items-start gap-2 mb-2">
                  <MapPin className="w-4 h-4 text-red-600 flex-shrink-0 mt-1" />
                  <div>
                    <h4 className="font-semibold text-sm text-gray-900">
                      {listing.address}
                    </h4>
                    <p className="text-xs text-gray-500">
                      {listing.suburb} {listing.postcode}
                    </p>
                  </div>
                </div>

                {/* Price */}
                <div className="flex items-center gap-2 mb-2">
                  <DollarSign className="w-4 h-4 text-green-600" />
                  <span className="font-bold text-lg text-green-600">
                    {listing.price}
                  </span>
                </div>

                {/* Property Details */}
                <div className="space-y-1 text-xs text-gray-600 mb-3 bg-gray-50 p-2 rounded">
                  <div className="flex gap-4">
                    {listing.bedrooms && <span>🛏️ {listing.bedrooms} bed</span>}
                    {listing.bathrooms && (
                      <span>🚿 {listing.bathrooms} bath</span>
                    )}
                    {listing.parking && <span>🅿️ {listing.parking} park</span>}
                  </div>
                  {listing.landSize && <div>📐 {listing.landSize}</div>}
                </div>

                {/* Agent Info */}
                <div className="border-t border-gray-200 pt-2 mb-2">
                  <p className="text-xs text-gray-600 font-medium">
                    {listing.agentName}
                  </p>
                  {listing.agentPhone && (
                    <a
                      href={`tel:${listing.agentPhone}`}
                      className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700"
                    >
                      <Phone className="w-3 h-3" />
                      {listing.agentPhone}
                    </a>
                  )}
                </div>

                {/* View Listing Button */}
                <button
                  onClick={() => window.open(listing.url, "_blank")}
                  className="w-full py-3 px-4 mt-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded transition-colors"
                >
                  View Listing
                </button>
              </div>
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
