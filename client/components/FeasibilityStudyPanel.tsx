import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { 
  ChevronDown, 
  ChevronRight, 
  Home, 
  Calculator, 
  Users, 
  DollarSign, 
  TrendingUp,
  FileText,
  Download,
  X
} from 'lucide-react';
import type { SelectedParcel } from "../../shared/types";

interface FeasibilityStudyData {
  // Site Acquisition
  landPrice: number;
  stampDuty: number;
  settlementFees: number;

  // Build Plan
  dwellingType: 'single' | 'duplex' | 'triplex' | 'quad' | '5-unit' | '6-unit' | '7-unit' | '8-unit';
  numberOfDwellings: number;
  dwellingAreas: number[]; // Array for each dwelling's area
  buildCostRate: number;
  contingencyPercent: number;
  buildTimeMonths: number; // New field

  // Professional Costs
  designFees: number; // Changed from percentage to fixed amount
  surveying: number;
  engineering: number;
  councilFees: number;
  otherCosts: number; // New field

  // Finance Structure
  loanToValueRatio: number;
  interestRate: number;
  loanTermYears: number; // Changed from months to years
  holdingCostsPerMonth: number;

  // Sales
  dwellingSalePrices: number[]; // Array for each dwelling's sale price
  sellingCostsPercent: number;
}

interface FeasibilityStudyPanelProps {
  selectedParcel?: SelectedParcel;
  show: boolean;
  onClose: () => void;
}

const DEFAULT_BUILD_COST_RATES = {
  single: 2200,
  duplex: 2000,
  triplex: 1900,
  quad: 1850,
  '5-unit': 1800,
  '6-unit': 1750,
  '7-unit': 1700,
  '8-unit': 1650
};

export function FeasibilityStudyPanel({ selectedParcel, show, onClose }: FeasibilityStudyPanelProps) {
  const [openSections, setOpenSections] = useState({
    siteAcquisition: true,
    buildPlan: false,
    professionalCosts: false,
    financeStructure: false,
    sales: false,
    finalReport: false
  });

  const [data, setData] = useState<FeasibilityStudyData>({
    // Site Acquisition defaults
    landPrice: 0,
    stampDuty: 0,
    settlementFees: 5000,

    // Build Plan defaults
    dwellingType: 'single',
    numberOfDwellings: 1,
    dwellingAreas: [200], // Default one dwelling with 200m²
    buildCostRate: DEFAULT_BUILD_COST_RATES.single,
    contingencyPercent: 10,
    buildTimeMonths: 12, // Default 12 months build time

    // Professional Costs defaults
    designFees: 20000, // Changed to fixed amount
    surveying: 2500,
    engineering: 5000,
    councilFees: 10000,
    otherCosts: 0, // New field

    // Finance Structure defaults
    loanToValueRatio: 80,
    interestRate: 6.5,
    loanTermYears: 2, // Changed to years (2 years = 24 months)
    holdingCostsPerMonth: 2000,

    // Sales defaults
    dwellingSalePrices: [500000], // Default one dwelling at $500k
    sellingCostsPercent: 3.0
  });

  // Auto-calculate stamp duty based on land price (WA rates)
  useEffect(() => {
    if (data.landPrice > 0) {
      let stampDuty = 0;
      if (data.landPrice <= 120000) {
        stampDuty = data.landPrice * 0.017;
      } else if (data.landPrice <= 150000) {
        stampDuty = 2040 + (data.landPrice - 120000) * 0.018;
      } else if (data.landPrice <= 360000) {
        stampDuty = 2580 + (data.landPrice - 150000) * 0.031;
      } else if (data.landPrice <= 725000) {
        stampDuty = 9090 + (data.landPrice - 360000) * 0.042;
      } else {
        stampDuty = 24420 + (data.landPrice - 725000) * 0.057;
      }
      setData(prev => ({ ...prev, stampDuty: Math.round(stampDuty) }));
    }
  }, [data.landPrice]);

  // Update build cost rate and suggested dwelling count when dwelling type changes
  useEffect(() => {
    const suggestedCounts: Record<string, number> = {
      'single': 1,
      'duplex': 2,
      'triplex': 3,
      'quad': 4,
      '5-unit': 5,
      '6-unit': 6,
      '7-unit': 7,
      '8-unit': 8
    };

    const newCount = suggestedCounts[data.dwellingType] || data.numberOfDwellings;

    setData(prev => ({
      ...prev,
      buildCostRate: DEFAULT_BUILD_COST_RATES[data.dwellingType]
    }));

    // Only auto-update dwelling count if it's different and makes sense
    if (newCount !== data.numberOfDwellings && newCount > 0) {
      handleNumberOfDwellingsChange(newCount);
    }
  }, [data.dwellingType]);

  // Handle number of dwellings change - adjust arrays
  const handleNumberOfDwellingsChange = (newCount: number) => {
    const currentAreas = [...data.dwellingAreas];
    const currentPrices = [...data.dwellingSalePrices];

    // Adjust dwelling areas array
    while (currentAreas.length < newCount) {
      currentAreas.push(200); // Default 200m² for new dwellings
    }
    if (currentAreas.length > newCount) {
      currentAreas.splice(newCount);
    }

    // Adjust sale prices array
    while (currentPrices.length < newCount) {
      currentPrices.push(500000); // Default $500k for new dwellings
    }
    if (currentPrices.length > newCount) {
      currentPrices.splice(newCount);
    }

    setData(prev => ({
      ...prev,
      numberOfDwellings: newCount,
      dwellingAreas: currentAreas,
      dwellingSalePrices: currentPrices
    }));
  };

  // Update individual dwelling area
  const updateDwellingArea = (index: number, area: number) => {
    const newAreas = [...data.dwellingAreas];
    newAreas[index] = area;
    setData(prev => ({ ...prev, dwellingAreas: newAreas }));
  };

  // Update individual dwelling sale price
  const updateDwellingSalePrice = (index: number, price: number) => {
    const newPrices = [...data.dwellingSalePrices];
    newPrices[index] = price;
    setData(prev => ({ ...prev, dwellingSalePrices: newPrices }));
  };

  // PDF Export function
  const handlePDFExport = () => {
    // Create a comprehensive HTML report for PDF conversion
    const reportHTML = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Feasibility Study Report</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 20px; }
          h1 { color: #059669; text-align: center; }
          h2 { color: #374151; border-bottom: 2px solid #059669; padding-bottom: 5px; }
          .summary { background: #f3f4f6; padding: 15px; border-radius: 8px; margin: 20px 0; }
          .kpi-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 15px; margin: 20px 0; }
          .kpi-box { background: white; padding: 15px; border-radius: 8px; border: 1px solid #d1d5db; text-align: center; }
          .profit-indicator { display: inline-block; padding: 8px 16px; border-radius: 20px; color: white; font-weight: bold; }
          .green { background: #10b981; }
          .amber { background: #f59e0b; }
          .red { background: #ef4444; }
          table { width: 100%; border-collapse: collapse; margin: 10px 0; }
          th, td { border: 1px solid #d1d5db; padding: 8px; text-align: left; }
          th { background: #f9fafb; }
          .currency { text-align: right; }
        </style>
      </head>
      <body>
        <h1>Development Feasibility Study</h1>

        <div class="summary">
          <h3>Property Details</h3>
          <p><strong>Property:</strong> ${selectedParcel?.data?.planNumber || 'N/A'}</p>
          <p><strong>Lot Size:</strong> ${selectedParcel?.data?.lotSize || 'N/A'}</p>
          <p><strong>Report Date:</strong> ${new Date().toLocaleDateString()}</p>
        </div>

        <div class="kpi-grid">
          <div class="kpi-box">
            <h4>Total Development Cost</h4>
            <div style="font-size: 20px; font-weight: bold; color: #3b82f6;">${formatCurrency(totalProjectCost)}</div>
          </div>
          <div class="kpi-box">
            <h4>Gross Realisation Value</h4>
            <div style="font-size: 20px; font-weight: bold; color: #6366f1;">${formatCurrency(grossRealisationValue)}</div>
          </div>
          <div class="kpi-box">
            <h4>Net Profit</h4>
            <div style="font-size: 20px; font-weight: bold; color: ${profit >= 0 ? '#10b981' : '#ef4444'};">${formatCurrency(profit)}</div>
          </div>
          <div class="kpi-box">
            <h4>Profit Margin</h4>
            <div style="font-size: 20px; font-weight: bold;">${formatPercent(profitMargin)}</div>
            <div class="profit-indicator ${getProfitIndicator().color.replace('bg-', '').replace('-500', '')}">${getProfitIndicator().text}</div>
          </div>
        </div>

        <h2>1. Site Acquisition</h2>
        <table>
          <tr><td>Land Price</td><td class="currency">${formatCurrency(data.landPrice)}</td></tr>
          <tr><td>Stamp Duty</td><td class="currency">${formatCurrency(data.stampDuty)}</td></tr>
          <tr><td>Settlement/Legal Fees</td><td class="currency">${formatCurrency(data.settlementFees)}</td></tr>
          <tr><th>Total Site Cost</th><th class="currency">${formatCurrency(siteCost)}</th></tr>
        </table>

        <h2>2. Build Plan</h2>
        <p><strong>Dwelling Type:</strong> ${data.dwellingType}</p>
        <p><strong>Number of Dwellings:</strong> ${data.numberOfDwellings}</p>
        <p><strong>Total Build Area:</strong> ${totalBuildArea}m²</p>
        <p><strong>Build Cost Rate:</strong> ${formatCurrency(data.buildCostRate)}/m²</p>
        <p><strong>Build Time:</strong> ${data.buildTimeMonths} months</p>
        <table>
          <tr><td>Base Build Cost</td><td class="currency">${formatCurrency(buildCost)}</td></tr>
          <tr><td>Contingency (${data.contingencyPercent}%)</td><td class="currency">${formatCurrency(contingencyCost)}</td></tr>
          <tr><th>Total Build Cost</th><th class="currency">${formatCurrency(totalBuildCost)}</th></tr>
        </table>

        <h2>3. Professional Costs</h2>
        <table>
          <tr><td>Design & Drafting Fees</td><td class="currency">${formatCurrency(data.designFees)}</td></tr>
          <tr><td>Surveying</td><td class="currency">${formatCurrency(data.surveying)}</td></tr>
          <tr><td>Engineering & Certifiers</td><td class="currency">${formatCurrency(data.engineering)}</td></tr>
          <tr><td>Council Fees</td><td class="currency">${formatCurrency(data.councilFees)}</td></tr>
          <tr><td>Other Costs</td><td class="currency">${formatCurrency(data.otherCosts)}</td></tr>
          <tr><th>Total Professional Costs</th><th class="currency">${formatCurrency(totalProfessionalCosts)}</th></tr>
        </table>

        <h2>4. Finance Structure</h2>
        <table>
          <tr><td>Loan-to-Value Ratio</td><td>${data.loanToValueRatio}%</td></tr>
          <tr><td>Interest Rate</td><td>${data.interestRate}%</td></tr>
          <tr><td>Loan Term</td><td>${data.loanTermYears} years</td></tr>
          <tr><td>Loan Amount</td><td class="currency">${formatCurrency(loanAmount)}</td></tr>
          <tr><td>Equity Required</td><td class="currency">${formatCurrency(equityRequired)}</td></tr>
          <tr><td>Interest Cost (Build Period)</td><td class="currency">${formatCurrency(interestCost)}</td></tr>
          <tr><td>Holding Costs (Build Period)</td><td class="currency">${formatCurrency(holdingCosts)}</td></tr>
          <tr><th>Total Finance Costs</th><th class="currency">${formatCurrency(totalFinanceCosts)}</th></tr>
        </table>

        <h2>5. Sales</h2>
        <table>
          <tr><td>Total Sales Revenue</td><td class="currency">${formatCurrency(totalSalesRevenue)}</td></tr>
          <tr><td>Selling Costs (${data.sellingCostsPercent}%)</td><td class="currency">${formatCurrency(sellingCosts)}</td></tr>
          <tr><th>Gross Realisation Value</th><th class="currency">${formatCurrency(grossRealisationValue)}</th></tr>
        </table>

        <h2>Financial Summary</h2>
        <table>
          <tr><td>Site Acquisition</td><td class="currency">${formatCurrency(siteCost)}</td></tr>
          <tr><td>Build Costs</td><td class="currency">${formatCurrency(totalBuildCost)}</td></tr>
          <tr><td>Professional Costs</td><td class="currency">${formatCurrency(totalProfessionalCosts)}</td></tr>
          <tr><td>Finance Costs</td><td class="currency">${formatCurrency(totalFinanceCosts)}</td></tr>
          <tr><th>Total Project Cost</th><th class="currency">${formatCurrency(totalProjectCost)}</th></tr>
          <tr><td>Gross Revenue</td><td class="currency">${formatCurrency(grossRealisationValue)}</td></tr>
          <tr><th style="color: ${profit >= 0 ? '#10b981' : '#ef4444'}">Net Profit</th><th class="currency" style="color: ${profit >= 0 ? '#10b981' : '#ef4444'}">${formatCurrency(profit)}</th></tr>
        </table>

        <div class="summary">
          <h3>Investment Analysis</h3>
          <p><strong>Return on Equity:</strong> ${formatPercent(returnOnEquity)}</p>
          <p><strong>Profit Margin:</strong> ${formatPercent(profitMargin)}</p>
          <p><strong>Project Viability:</strong> <span class="profit-indicator ${getProfitIndicator().color.replace('bg-', '').replace('-500', '')}">${getProfitIndicator().text}</span></p>
        </div>
      </body>
      </html>
    `;

    // Create a new window and print as PDF
    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(reportHTML);
      printWindow.document.close();

      // Wait for content to load, then trigger print
      printWindow.addEventListener('load', () => {
        printWindow.print();
        // Close window after printing
        printWindow.addEventListener('afterprint', () => {
          printWindow.close();
        });
      });
    }
  };

  // Calculations
  const siteCost = data.landPrice + data.stampDuty + data.settlementFees;

  // Calculate total build area and cost for all dwellings
  const totalBuildArea = data.dwellingAreas.reduce((sum, area) => sum + area, 0);
  const buildCost = totalBuildArea * data.buildCostRate;
  const contingencyCost = buildCost * (data.contingencyPercent / 100);
  const totalBuildCost = buildCost + contingencyCost;

  // Professional costs (no more marketing percentage)
  const totalProfessionalCosts = data.designFees + data.surveying + data.engineering + data.councilFees + data.otherCosts;

  // Development cost before finance
  const totalDevelopmentCost = siteCost + totalBuildCost + totalProfessionalCosts;
  const equityRequired = totalDevelopmentCost * ((100 - data.loanToValueRatio) / 100);
  const loanAmount = totalDevelopmentCost - equityRequired;

  // Finance costs - interest and holding costs both based on build time only
  const loanTermMonths = data.loanTermYears * 12;
  const interestCost = loanAmount * (data.interestRate / 100) * (data.buildTimeMonths / 12);
  const holdingCosts = data.holdingCostsPerMonth * data.buildTimeMonths; // Fixed: use build time, not loan term
  const totalFinanceCosts = interestCost + holdingCosts;

  // Sales calculations
  const totalSalesRevenue = data.dwellingSalePrices.reduce((sum, price) => sum + price, 0);
  const sellingCosts = totalSalesRevenue * (data.sellingCostsPercent / 100);
  const grossRealisationValue = totalSalesRevenue - sellingCosts;

  // Final calculations
  const totalProjectCost = totalDevelopmentCost + totalFinanceCosts;
  const profit = grossRealisationValue - totalProjectCost;
  const profitMargin = grossRealisationValue > 0 ? (profit / grossRealisationValue) * 100 : 0;
  const returnOnEquity = equityRequired > 0 ? (profit / equityRequired) * 100 : 0;

  const toggleSection = (section: keyof typeof openSections) => {
    setOpenSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

  const updateField = (field: keyof FeasibilityStudyData, value: any) => {
    setData(prev => ({ ...prev, [field]: value }));
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-AU', {
      style: 'currency',
      currency: 'AUD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const formatPercent = (percent: number) => {
    return `${percent.toFixed(1)}%`;
  };

  const getProfitColor = () => {
    if (profitMargin >= 20) return 'text-green-600 bg-green-50';
    if (profitMargin >= 10) return 'text-amber-600 bg-amber-50';
    return 'text-red-600 bg-red-50';
  };

  const getProfitIndicator = () => {
    if (profitMargin >= 20) return { color: 'bg-green-500', text: 'EXCELLENT' };
    if (profitMargin >= 10) return { color: 'bg-amber-500', text: 'GOOD' };
    return { color: 'bg-red-500', text: 'POOR' };
  };

  if (!show) return null;

  return (
    <div className="bg-white rounded-lg shadow-lg overflow-hidden">
      {/* Header */}
      <div className="bg-gradient-to-r from-emerald-500 to-emerald-600 text-white p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <Calculator className="w-6 h-6" />
            <div>
              <h2 className="font-bold text-lg">Feasibility Study</h2>
              <p className="text-emerald-100 text-sm">
                {selectedParcel?.data?.planNumber || "Property"} | 
                {selectedParcel?.data?.lotSize || "Unknown area"}
              </p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            className="text-white hover:bg-emerald-700"
          >
            <X className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Scrollable Content */}
      <div className="max-h-[80vh] overflow-y-auto p-4 space-y-4">
        
        {/* Site Acquisition Section */}
        <Card>
          <Collapsible open={openSections.siteAcquisition} onOpenChange={() => toggleSection('siteAcquisition')}>
            <CollapsibleTrigger asChild>
              <CardHeader className="cursor-pointer hover:bg-gray-50">
                <CardTitle className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <Home className="w-5 h-5 text-blue-600" />
                    <span>1. Site Acquisition</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Badge variant="outline">{formatCurrency(siteCost)}</Badge>
                    {openSections.siteAcquisition ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                  </div>
                </CardTitle>
              </CardHeader>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="landPrice">Land Price</Label>
                    <Input
                      id="landPrice"
                      type="number"
                      value={data.landPrice || ''}
                      onChange={(e) => updateField('landPrice', Number(e.target.value))}
                      placeholder="Enter land price"
                    />
                  </div>
                  <div>
                    <Label htmlFor="stampDuty">Stamp Duty (auto-calculated)</Label>
                    <Input
                      id="stampDuty"
                      type="number"
                      value={data.stampDuty || ''}
                      onChange={(e) => updateField('stampDuty', Number(e.target.value))}
                      placeholder="Auto-calculated"
                    />
                  </div>
                  <div>
                    <Label htmlFor="settlementFees">Settlement / Legal Fees</Label>
                    <Input
                      id="settlementFees"
                      type="number"
                      value={data.settlementFees || ''}
                      onChange={(e) => updateField('settlementFees', Number(e.target.value))}
                      placeholder="5000"
                    />
                  </div>
                  <div className="flex items-end">
                    <div className="w-full">
                      <Label className="font-semibold">Total Site Cost</Label>
                      <div className="text-2xl font-bold text-blue-600">{formatCurrency(siteCost)}</div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </CollapsibleContent>
          </Collapsible>
        </Card>

        {/* Build Plan Section */}
        <Card>
          <Collapsible open={openSections.buildPlan} onOpenChange={() => toggleSection('buildPlan')}>
            <CollapsibleTrigger asChild>
              <CardHeader className="cursor-pointer hover:bg-gray-50">
                <CardTitle className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <Calculator className="w-5 h-5 text-green-600" />
                    <span>2. Build Plan</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Badge variant="outline">{formatCurrency(totalBuildCost)}</Badge>
                    {openSections.buildPlan ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                  </div>
                </CardTitle>
              </CardHeader>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="dwellingType">Dwelling Type</Label>
                    <Select value={data.dwellingType} onValueChange={(value) => updateField('dwellingType', value)}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select dwelling type" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="single">Single House</SelectItem>
                        <SelectItem value="duplex">Duplex</SelectItem>
                        <SelectItem value="triplex">Triplex</SelectItem>
                        <SelectItem value="quad">Quad</SelectItem>
                        <SelectItem value="5-unit">5 Units</SelectItem>
                        <SelectItem value="6-unit">6 Units</SelectItem>
                        <SelectItem value="7-unit">7 Units</SelectItem>
                        <SelectItem value="8-unit">8 Units</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="numberOfDwellings">Number of Dwellings</Label>
                    <Input
                      id="numberOfDwellings"
                      type="number"
                      value={data.numberOfDwellings || ''}
                      onChange={(e) => handleNumberOfDwellingsChange(Number(e.target.value))}
                      min="1"
                    />
                  </div>
                  <div>
                    <Label htmlFor="buildCostRate">Build Cost Rate ($/m²)</Label>
                    <Input
                      id="buildCostRate"
                      type="number"
                      value={data.buildCostRate || ''}
                      onChange={(e) => updateField('buildCostRate', Number(e.target.value))}
                      placeholder="2200"
                    />
                  </div>
                  <div>
                    <Label htmlFor="buildTimeMonths">Build Time (months)</Label>
                    <Input
                      id="buildTimeMonths"
                      type="number"
                      value={data.buildTimeMonths || ''}
                      onChange={(e) => updateField('buildTimeMonths', Number(e.target.value))}
                      placeholder="12"
                      min="1"
                    />
                  </div>
                  <div>
                    <Label htmlFor="contingencyPercent">Contingency (%)</Label>
                    <Input
                      id="contingencyPercent"
                      type="number"
                      value={data.contingencyPercent || ''}
                      onChange={(e) => updateField('contingencyPercent', Number(e.target.value))}
                      placeholder="10"
                      step="0.1"
                    />
                  </div>
                  <div className="flex items-end">
                    <div className="w-full">
                      <Label className="font-semibold">Total Build Area</Label>
                      <div className="text-xl font-bold text-green-600">{totalBuildArea.toLocaleString()} m²</div>
                    </div>
                  </div>
                </div>

                {/* Individual Dwelling Areas */}
                <div className="border-t pt-4">
                  <Label className="font-semibold mb-3 block">Individual Dwelling Areas</Label>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {data.dwellingAreas.map((area, index) => (
                      <div key={index}>
                        <Label htmlFor={`dwelling-area-${index}`} className="text-sm">
                          Dwelling {index + 1} Area (m²)
                        </Label>
                        <Input
                          id={`dwelling-area-${index}`}
                          type="number"
                          value={area || ''}
                          onChange={(e) => updateDwellingArea(index, Number(e.target.value))}
                          placeholder="200"
                        />
                      </div>
                    ))}
                  </div>
                </div>

                {/* Total Build Cost Summary */}
                <div className="bg-green-50 p-4 rounded-lg">
                  <Label className="font-semibold">Total Build Cost</Label>
                  <div className="text-2xl font-bold text-green-600">{formatCurrency(totalBuildCost)}</div>
                  <div className="text-sm text-gray-600">
                    Base: {formatCurrency(buildCost)} + Contingency: {formatCurrency(contingencyCost)}
                  </div>
                  <div className="text-sm text-gray-600">
                    Build Time: {data.buildTimeMonths} months
                  </div>
                </div>
              </CardContent>
            </CollapsibleContent>
          </Collapsible>
        </Card>

        {/* Professional Costs Section */}
        <Card>
          <Collapsible open={openSections.professionalCosts} onOpenChange={() => toggleSection('professionalCosts')}>
            <CollapsibleTrigger asChild>
              <CardHeader className="cursor-pointer hover:bg-gray-50">
                <CardTitle className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <Users className="w-5 h-5 text-purple-600" />
                    <span>3. Professional Costs</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Badge variant="outline">{formatCurrency(totalProfessionalCosts)}</Badge>
                    {openSections.professionalCosts ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                  </div>
                </CardTitle>
              </CardHeader>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="designFees">Design & Drafting Fees</Label>
                    <Input
                      id="designFees"
                      type="number"
                      value={data.designFees || ''}
                      onChange={(e) => updateField('designFees', Number(e.target.value))}
                      placeholder="20000"
                    />
                  </div>
                  <div>
                    <Label htmlFor="surveying">Surveying</Label>
                    <Input
                      id="surveying"
                      type="number"
                      value={data.surveying || ''}
                      onChange={(e) => updateField('surveying', Number(e.target.value))}
                      placeholder="2500"
                    />
                  </div>
                  <div>
                    <Label htmlFor="engineering">Engineering & Certifiers</Label>
                    <Input
                      id="engineering"
                      type="number"
                      value={data.engineering || ''}
                      onChange={(e) => updateField('engineering', Number(e.target.value))}
                      placeholder="5000"
                    />
                  </div>
                  <div>
                    <Label htmlFor="councilFees">Council Fees</Label>
                    <Input
                      id="councilFees"
                      type="number"
                      value={data.councilFees || ''}
                      onChange={(e) => updateField('councilFees', Number(e.target.value))}
                      placeholder="10000"
                    />
                  </div>
                  <div>
                    <Label htmlFor="otherCosts">Other Professional Costs</Label>
                    <Input
                      id="otherCosts"
                      type="number"
                      value={data.otherCosts || ''}
                      onChange={(e) => updateField('otherCosts', Number(e.target.value))}
                      placeholder="0"
                    />
                  </div>
                  <div className="flex items-end">
                    <div className="w-full">
                      <Label className="font-semibold">Total Professional Costs</Label>
                      <div className="text-2xl font-bold text-purple-600">{formatCurrency(totalProfessionalCosts)}</div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </CollapsibleContent>
          </Collapsible>
        </Card>

        {/* Finance Structure Section */}
        <Card>
          <Collapsible open={openSections.financeStructure} onOpenChange={() => toggleSection('financeStructure')}>
            <CollapsibleTrigger asChild>
              <CardHeader className="cursor-pointer hover:bg-gray-50">
                <CardTitle className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <DollarSign className="w-5 h-5 text-orange-600" />
                    <span>4. Finance Structure</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Badge variant="outline">{formatCurrency(totalFinanceCosts)}</Badge>
                    {openSections.financeStructure ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                  </div>
                </CardTitle>
              </CardHeader>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="loanToValueRatio">Loan-to-Value Ratio (%)</Label>
                    <Input
                      id="loanToValueRatio"
                      type="number"
                      value={data.loanToValueRatio || ''}
                      onChange={(e) => updateField('loanToValueRatio', Number(e.target.value))}
                      placeholder="80"
                      min="0"
                      max="100"
                    />
                  </div>
                  <div>
                    <Label htmlFor="interestRate">Interest Rate (%)</Label>
                    <Input
                      id="interestRate"
                      type="number"
                      value={data.interestRate || ''}
                      onChange={(e) => updateField('interestRate', Number(e.target.value))}
                      placeholder="6.5"
                      step="0.1"
                    />
                  </div>
                  <div>
                    <Label htmlFor="loanTermYears">Loan Term (years)</Label>
                    <Input
                      id="loanTermYears"
                      type="number"
                      value={data.loanTermYears || ''}
                      onChange={(e) => updateField('loanTermYears', Number(e.target.value))}
                      placeholder="2"
                      min="0.5"
                      max="30"
                      step="0.5"
                    />
                  </div>
                  <div>
                    <Label htmlFor="holdingCostsPerMonth">Holding Costs per Month</Label>
                    <Input
                      id="holdingCostsPerMonth"
                      type="number"
                      value={data.holdingCostsPerMonth || ''}
                      onChange={(e) => updateField('holdingCostsPerMonth', Number(e.target.value))}
                      placeholder="2000"
                    />
                  </div>
                  <div className="bg-gray-50 p-4 rounded-lg">
                    <Label className="font-semibold">Equity Required</Label>
                    <div className="text-xl font-bold text-orange-600">{formatCurrency(equityRequired)}</div>
                    <div className="text-sm text-gray-600">
                      ({formatPercent(100 - data.loanToValueRatio)} of {formatCurrency(totalDevelopmentCost)})
                    </div>
                  </div>
                  <div className="bg-gray-50 p-4 rounded-lg">
                    <Label className="font-semibold">Loan Amount</Label>
                    <div className="text-xl font-bold text-orange-600">{formatCurrency(loanAmount)}</div>
                    <div className="text-sm text-gray-600">
                      @ {formatPercent(data.interestRate)} for {data.loanTermYears} years ({loanTermMonths} months)
                    </div>
                  </div>
                  <div className="bg-orange-50 p-4 rounded-lg">
                    <Label className="font-semibold">Interest Cost (Build Period)</Label>
                    <div className="text-xl font-bold text-orange-600">{formatCurrency(interestCost)}</div>
                    <div className="text-sm text-gray-600">
                      {data.buildTimeMonths} months @ {formatPercent(data.interestRate)}
                    </div>
                  </div>
                  <div className="bg-orange-50 p-4 rounded-lg">
                    <Label className="font-semibold">Holding Costs (Build Period)</Label>
                    <div className="text-xl font-bold text-orange-600">{formatCurrency(holdingCosts)}</div>
                    <div className="text-sm text-gray-600">
                      {formatCurrency(data.holdingCostsPerMonth)}/month × {data.buildTimeMonths} months
                    </div>
                  </div>
                </div>

                {/* Total Finance Costs Summary */}
                <div className="bg-orange-100 p-4 rounded-lg border-2 border-orange-200">
                  <Label className="font-semibold">Total Finance Costs</Label>
                  <div className="text-2xl font-bold text-orange-700">{formatCurrency(totalFinanceCosts)}</div>
                  <div className="text-sm text-gray-600">
                    Interest: {formatCurrency(interestCost)} + Holding: {formatCurrency(holdingCosts)}
                  </div>
                </div>
              </CardContent>
            </CollapsibleContent>
          </Collapsible>
        </Card>

        {/* Sales Section */}
        <Card>
          <Collapsible open={openSections.sales} onOpenChange={() => toggleSection('sales')}>
            <CollapsibleTrigger asChild>
              <CardHeader className="cursor-pointer hover:bg-gray-50">
                <CardTitle className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <TrendingUp className="w-5 h-5 text-indigo-600" />
                    <span>5. Sales</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Badge variant="outline">{formatCurrency(grossRealisationValue)}</Badge>
                    {openSections.sales ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                  </div>
                </CardTitle>
              </CardHeader>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="sellingCostsPercent">Selling Costs (%)</Label>
                    <Input
                      id="sellingCostsPercent"
                      type="number"
                      value={data.sellingCostsPercent || ''}
                      onChange={(e) => updateField('sellingCostsPercent', Number(e.target.value))}
                      placeholder="3.0"
                      step="0.1"
                    />
                  </div>
                  <div className="bg-gray-50 p-4 rounded-lg">
                    <Label className="font-semibold">Total Sales Revenue</Label>
                    <div className="text-xl font-bold text-indigo-600">{formatCurrency(totalSalesRevenue)}</div>
                    <div className="text-sm text-gray-600">
                      {data.numberOfDwellings} dwelling(s)
                    </div>
                  </div>
                  <div></div>
                  <div className="bg-gray-50 p-4 rounded-lg">
                    <Label className="font-semibold">Gross Realisation Value</Label>
                    <div className="text-xl font-bold text-indigo-600">{formatCurrency(grossRealisationValue)}</div>
                    <div className="text-sm text-gray-600">
                      After selling costs: {formatCurrency(sellingCosts)}
                    </div>
                  </div>
                </div>

                {/* Individual Dwelling Sale Prices */}
                <div className="border-t pt-4">
                  <Label className="font-semibold mb-3 block">Individual Dwelling Sale Prices</Label>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {data.dwellingSalePrices.map((price, index) => (
                      <div key={index}>
                        <Label htmlFor={`dwelling-price-${index}`} className="text-sm">
                          Dwelling {index + 1} Sale Price
                        </Label>
                        <Input
                          id={`dwelling-price-${index}`}
                          type="number"
                          value={price || ''}
                          onChange={(e) => updateDwellingSalePrice(index, Number(e.target.value))}
                          placeholder="500000"
                        />
                        <div className="text-xs text-gray-500 mt-1">
                          Area: {data.dwellingAreas[index] || 0}m² |
                          Rate: {price && data.dwellingAreas[index] ? formatCurrency(price / data.dwellingAreas[index]) : '$0'}/m²
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Sales Summary */}
                <div className="bg-indigo-50 p-4 rounded-lg">
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <Label className="font-semibold">Revenue Breakdown:</Label>
                      {data.dwellingSalePrices.map((price, index) => (
                        <div key={index} className="flex justify-between">
                          <span>Dwelling {index + 1}:</span>
                          <span>{formatCurrency(price)}</span>
                        </div>
                      ))}
                    </div>
                    <div>
                      <Label className="font-semibold">Cost Breakdown:</Label>
                      <div className="flex justify-between">
                        <span>Gross Revenue:</span>
                        <span>{formatCurrency(totalSalesRevenue)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Selling Costs ({data.sellingCostsPercent}%):</span>
                        <span>-{formatCurrency(sellingCosts)}</span>
                      </div>
                      <div className="flex justify-between font-semibold border-t pt-1">
                        <span>Net Revenue:</span>
                        <span>{formatCurrency(grossRealisationValue)}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </CollapsibleContent>
          </Collapsible>
        </Card>

        {/* Final Report Section */}
        <Card>
          <Collapsible open={openSections.finalReport} onOpenChange={() => toggleSection('finalReport')}>
            <CollapsibleTrigger asChild>
              <CardHeader className="cursor-pointer hover:bg-gray-50">
                <CardTitle className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <FileText className="w-5 h-5 text-red-600" />
                    <span>6. Final Report</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <div className={`w-3 h-3 rounded-full ${getProfitIndicator().color}`}></div>
                    <Badge variant="outline">{getProfitIndicator().text}</Badge>
                    {openSections.finalReport ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                  </div>
                </CardTitle>
              </CardHeader>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <CardContent className="space-y-6">
                {/* KPI Summary */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  <div className="bg-blue-50 p-4 rounded-lg text-center">
                    <Label className="text-sm text-blue-600 font-medium">Total Development Cost</Label>
                    <div className="text-xl font-bold text-blue-700">{formatCurrency(totalProjectCost)}</div>
                  </div>
                  <div className="bg-indigo-50 p-4 rounded-lg text-center">
                    <Label className="text-sm text-indigo-600 font-medium">Gross Realisation Value</Label>
                    <div className="text-xl font-bold text-indigo-700">{formatCurrency(grossRealisationValue)}</div>
                  </div>
                  <div className={`p-4 rounded-lg text-center ${profit >= 0 ? 'bg-green-50' : 'bg-red-50'}`}>
                    <Label className={`text-sm font-medium ${profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>Profit</Label>
                    <div className={`text-xl font-bold ${profit >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                      {formatCurrency(profit)}
                    </div>
                  </div>
                  <div className={`p-4 rounded-lg text-center ${getProfitColor()}`}>
                    <Label className="text-sm font-medium">Profit Margin</Label>
                    <div className="text-xl font-bold">{formatPercent(profitMargin)}</div>
                  </div>
                </div>

                {/* Traffic Light Indicator */}
                <div className="bg-gray-50 p-6 rounded-lg">
                  <div className="text-center mb-4">
                    <h3 className="text-lg font-semibold mb-2">Project Viability Assessment</h3>
                    <div className={`inline-flex items-center px-4 py-2 rounded-full text-white font-bold ${getProfitIndicator().color}`}>
                      <div className="w-3 h-3 bg-white rounded-full mr-2"></div>
                      {getProfitIndicator().text}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                    <div className="text-center">
                      <Label className="text-sm text-gray-600">Return on Equity</Label>
                      <div className="text-2xl font-bold text-gray-800">{formatPercent(returnOnEquity)}</div>
                    </div>
                    <div className="text-center">
                      <Label className="text-sm text-gray-600">Equity Required</Label>
                      <div className="text-2xl font-bold text-gray-800">{formatCurrency(equityRequired)}</div>
                    </div>
                  </div>
                </div>

                {/* Export Options */}
                <div className="border-t pt-4">
                  <h4 className="font-semibold mb-3">Export Report</h4>
                  <div className="flex flex-wrap gap-2">
                    <Button variant="outline" size="sm" onClick={handlePDFExport}>
                      <Download className="w-4 h-4 mr-2" />
                      Export PDF Report
                    </Button>
                  </div>
                </div>

                {/* Detailed Breakdown */}
                <div className="border-t pt-4">
                  <h4 className="font-semibold mb-3">Cost Breakdown</h4>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span>Site Acquisition:</span>
                      <span className="font-mono">{formatCurrency(siteCost)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Build Costs:</span>
                      <span className="font-mono">{formatCurrency(totalBuildCost)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Professional Costs:</span>
                      <span className="font-mono">{formatCurrency(totalProfessionalCosts)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Finance Costs:</span>
                      <span className="font-mono">{formatCurrency(totalFinanceCosts)}</span>
                    </div>
                    <div className="flex justify-between border-t pt-2 font-semibold">
                      <span>Total Project Cost:</span>
                      <span className="font-mono">{formatCurrency(totalProjectCost)}</span>
                    </div>
                    <div className="flex justify-between text-green-600 font-semibold">
                      <span>Gross Revenue:</span>
                      <span className="font-mono">{formatCurrency(grossRealisationValue)}</span>
                    </div>
                    <div className={`flex justify-between font-bold text-lg ${profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      <span>Net Profit:</span>
                      <span className="font-mono">{formatCurrency(profit)}</span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </CollapsibleContent>
          </Collapsible>
        </Card>

      </div>
    </div>
  );
}
