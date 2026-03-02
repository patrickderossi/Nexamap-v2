export function Footer() {
  return (
    <footer className="bg-gray-50 border-t border-gray-200 py-8 px-6 mt-16">
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center space-y-4 md:space-y-0">
          <div className="flex flex-wrap gap-6">
            <a href="#" className="text-gray-600 hover:text-nexamap-500 text-sm">
              About
            </a>
            <a href="#" className="text-gray-600 hover:text-nexamap-500 text-sm">
              Data Sources
            </a>
            <a href="#" className="text-gray-600 hover:text-nexamap-500 text-sm">
              Disclaimer
            </a>
          </div>
        </div>
        
        <div className="mt-6 pt-6 border-t border-gray-200">
          <p className="text-xs text-gray-500 max-w-2xl">
            <strong>Disclaimer:</strong> For planning reference only. Confirm with relevant authorities & local council before use.
            This tool provides indicative information only and should not be relied upon for final planning decisions.
          </p>
        </div>
      </div>
    </footer>
  );
}
