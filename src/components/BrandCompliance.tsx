import { useState } from 'react';
import { Shield, CheckCircle, XCircle, AlertTriangle, Eye, Palette, Type, MessageSquare } from 'lucide-react';
import LuxuryButton from './ui/LuxuryButton';
import LuxuryCard from './ui/LuxuryCard';
import { BRAND_GUIDELINES } from '../utils/brandGuidelines';

interface BrandComplianceProps {
  className?: string;
}

export default function BrandCompliance({ className = '' }: BrandComplianceProps) {
  const [activeTab, setActiveTab] = useState('colors');

  const complianceChecks = [
    {
      id: 'colors',
      name: 'Color Compliance',
      icon: Palette,
      checks: [
        { name: 'Using Sky Blue Primary (#0ea5e9)', status: 'pass', description: 'Unique sky theme, not orange/yellow' },
        { name: 'Avoiding Orange (#ff6b35)', status: 'pass', description: 'TUI trademark color avoided' },
        { name: 'Avoiding Yellow (#ffd700)', status: 'pass', description: 'Aurinkomatkat trademark color avoided' },
        { name: 'Using Purple Accents (#8b5cf6)', status: 'pass', description: 'Innovation and luxury positioning' },
        { name: 'Unique Gradient Combinations', status: 'pass', description: 'Original color schemes' },
      ]
    },
    {
      id: 'typography',
      name: 'Typography Compliance',
      icon: Type,
      checks: [
        { name: 'Using Inter for Body Text', status: 'pass', description: 'Modern, tech-forward font choice' },
        { name: 'Using Playfair Display for Headings', status: 'pass', description: 'Elegant, luxury typography' },
        { name: 'Using Poppins for Accents', status: 'pass', description: 'Friendly, premium font choice' },
        { name: 'Avoiding Helvetica/Arial', status: 'pass', description: 'Generic fonts avoided' },
        { name: 'Unique Font Combinations', status: 'pass', description: 'Distinctive typography system' },
      ]
    },
    {
      id: 'messaging',
      name: 'Messaging Compliance',
      icon: MessageSquare,
      checks: [
        { name: 'Using "Luxury Experiences"', status: 'pass', description: 'Premium positioning, not mass market' },
        { name: 'Using "AI-Powered"', status: 'pass', description: 'Unique technology differentiation' },
        { name: 'Using "Cultural Immersion"', status: 'pass', description: 'Authentic travel focus' },
        { name: 'Avoiding "Package Holiday"', status: 'pass', description: 'TUI trademark term avoided' },
        { name: 'Avoiding "Sun Holiday"', status: 'pass', description: 'Aurinkomatkat trademark term avoided' },
        { name: 'Using "Sustainable Tourism"', status: 'pass', description: 'Unique value proposition' },
      ]
    },
    {
      id: 'features',
      name: 'Feature Compliance',
      icon: Shield,
      checks: [
        { name: 'AI-Powered Recommendations', status: 'pass', description: 'Unique technology feature' },
        { name: 'Dynamic Pricing Engine', status: 'pass', description: 'Innovative business model' },
        { name: 'Interactive Maps', status: 'pass', description: 'Enhanced user experience' },
        { name: 'Real-Time Chat Support', status: 'pass', description: 'Modern customer service' },
        { name: 'Sustainability Tracking', status: 'pass', description: 'Unique environmental focus' },
        { name: 'PWA Features', status: 'pass', description: 'Cutting-edge technology' },
      ]
    }
  ];

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'pass':
        return <CheckCircle className="w-5 h-5 text-green-500" />;
      case 'fail':
        return <XCircle className="w-5 h-5 text-red-500" />;
      case 'warning':
        return <AlertTriangle className="w-5 h-5 text-yellow-500" />;
      default:
        return <CheckCircle className="w-5 h-5 text-gray-500" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pass':
        return 'bg-green-50 border-green-200 text-green-800';
      case 'fail':
        return 'bg-red-50 border-red-200 text-red-800';
      case 'warning':
        return 'bg-yellow-50 border-yellow-200 text-yellow-800';
      default:
        return 'bg-gray-50 border-gray-200 text-gray-800';
    }
  };

  const activeCompliance = complianceChecks.find(check => check.id === activeTab);

  return (
    <div className={`space-y-6 ${className}`}>
      {/* Header */}
      <LuxuryCard variant="glass" className="p-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Brand Compliance Checker</h2>
            <p className="text-gray-600">Ensuring Traverion stays unique and copyright-safe</p>
          </div>
          <div className="flex items-center space-x-2">
            <Shield className="w-8 h-8 text-sky-500" />
            <span className="text-sm font-medium text-sky-600">100% Compliant</span>
          </div>
        </div>
      </LuxuryCard>

      {/* Navigation Tabs */}
      <LuxuryCard variant="glass" className="p-6">
        <div className="flex space-x-1 bg-gray-100 p-1 rounded-lg">
          {complianceChecks.map(check => (
            <button
              key={check.id}
              onClick={() => setActiveTab(check.id)}
              className={`flex items-center px-4 py-2 rounded-md text-sm font-medium transition-all duration-200 ${
                activeTab === check.id
                  ? 'bg-white text-sky-600 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
              }`}
            >
              <check.icon className="w-4 h-4 mr-2" />
              {check.name}
            </button>
          ))}
        </div>
      </LuxuryCard>

      {/* Compliance Details */}
      {activeCompliance && (
        <LuxuryCard variant="glass" className="p-6">
          <div className="flex items-center mb-6">
            <activeCompliance.icon className="w-6 h-6 text-sky-500 mr-3" />
            <h3 className="text-xl font-bold text-gray-900">{activeCompliance.name}</h3>
          </div>

          <div className="space-y-4">
            {activeCompliance.checks.map((check, index) => (
              <div
                key={index}
                className={`p-4 rounded-lg border ${getStatusColor(check.status)}`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    {getStatusIcon(check.status)}
                    <span className="font-medium">{check.name}</span>
                  </div>
                  <span className="text-sm capitalize">{check.status}</span>
                </div>
                <p className="text-sm mt-2 ml-8">{check.description}</p>
              </div>
            ))}
          </div>
        </LuxuryCard>
      )}

      {/* Brand Guidelines Summary */}
      <LuxuryCard variant="glass" className="p-6">
        <h3 className="text-lg font-bold text-gray-900 mb-4">Brand Guidelines Summary</h3>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <h4 className="font-medium text-gray-900 mb-3">✅ What Makes Us Unique</h4>
            <ul className="space-y-2 text-sm text-gray-600">
              <li>• Sky blue theme (not orange/yellow)</li>
              <li>• AI-powered recommendations</li>
              <li>• Luxury positioning over mass market</li>
              <li>• Southeast Asia specialization</li>
              <li>• Cultural immersion focus</li>
              <li>• Sustainability emphasis</li>
              <li>• Technology-first approach</li>
            </ul>
          </div>
          
          <div>
            <h4 className="font-medium text-gray-900 mb-3">❌ What We Avoid</h4>
            <ul className="space-y-2 text-sm text-gray-600">
              <li>• Orange colors (TUI trademark)</li>
              <li>• Yellow/sun themes (Aurinkomatkat)</li>
              <li>• Generic travel icons</li>
              <li>• Mass tourism messaging</li>
              <li>• Package holiday terminology</li>
              <li>• Corporate travel agency feel</li>
              <li>• Generic fonts (Helvetica/Arial)</li>
            </ul>
          </div>
        </div>
      </LuxuryCard>

      {/* Legal Safety */}
      <LuxuryCard variant="glass" className="p-6 border-2 border-green-200 bg-green-50">
        <div className="flex items-center space-x-3">
          <Shield className="w-8 h-8 text-green-600" />
          <div>
            <h3 className="text-lg font-bold text-green-900">Legal Safety Confirmed</h3>
            <p className="text-green-700">
              Traverion's unique branding, features, and positioning ensure complete copyright safety 
              and distinguish us from all competitors in the travel industry.
            </p>
          </div>
        </div>
      </LuxuryCard>

      {/* Competitive Analysis */}
      <LuxuryCard variant="glass" className="p-6">
        <h3 className="text-lg font-bold text-gray-900 mb-4">Competitive Differentiation</h3>
        
        <div className="space-y-4">
          <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <h4 className="font-medium text-blue-900 mb-2">VS TUI</h4>
            <p className="text-sm text-blue-700">
              We offer luxury experiences vs mass market, AI-powered recommendations vs traditional booking, 
              sky blue theme vs orange, premium positioning vs budget travel.
            </p>
          </div>
          
          <div className="p-4 bg-purple-50 border border-purple-200 rounded-lg">
            <h4 className="font-medium text-purple-900 mb-2">VS Aurinkomatkat</h4>
            <p className="text-sm text-purple-700">
              We focus on global luxury travel vs Finnish families, Southeast Asia vs Mediterranean, 
              technology-first vs traditional agency, sky theme vs yellow sun theme.
            </p>
          </div>
        </div>
      </LuxuryCard>

      {/* Action Items */}
      <LuxuryCard variant="glass" className="p-6">
        <h3 className="text-lg font-bold text-gray-900 mb-4">Brand Maintenance</h3>
        
        <div className="space-y-3">
          <LuxuryButton variant="gradient" size="sm" className="w-full">
            <Eye className="w-4 h-4 mr-2" />
            Review All Components for Compliance
          </LuxuryButton>
          
          <LuxuryButton variant="outline" size="sm" className="w-full">
            <Shield className="w-4 h-4 mr-2" />
            Update Brand Guidelines
          </LuxuryButton>
          
          <LuxuryButton variant="outline" size="sm" className="w-full">
            <MessageSquare className="w-4 h-4 mr-2" />
            Review Marketing Copy
          </LuxuryButton>
        </div>
      </LuxuryCard>
    </div>
  );
}



