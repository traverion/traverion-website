import { useState, useEffect } from 'react';
import { 
  Users, 
  Calendar, 
  DollarSign, 
  TrendingUp, 
  TrendingDown, 
  Eye, 
  Edit, 
  Trash2, 
  Plus, 
  Search, 
  Filter, 
  Download, 
  Upload, 
  Settings, 
  BarChart3, 
  PieChart, 
  Activity,
  Clock,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Star,
  MessageSquare,
  Mail,
  Phone,
  MapPin,
  CreditCard,
  User,
  Calendar as CalendarIcon,
  Package,
  Globe,
  Shield,
  Zap
} from 'lucide-react';
import LuxuryButton from '../components/ui/LuxuryButton';
import LuxuryCard from '../components/ui/LuxuryCard';
import LuxuryInput from '../components/ui/LuxuryInput';
import BrandCompliance from '../components/BrandCompliance';

interface Booking {
  id: string;
  customer: {
    name: string;
    email: string;
    phone: string;
    nationality: string;
  };
  tour: {
    id: string;
    name: string;
    destination: string;
    duration: number;
  };
  dates: {
    departure: Date;
    return: Date;
  };
  pricing: {
    basePrice: number;
    finalPrice: number;
    discount: number;
    currency: string;
  };
  status: 'pending' | 'confirmed' | 'paid' | 'completed' | 'cancelled';
  groupSize: number;
  specialRequests: string;
  createdAt: Date;
  paymentMethod: string;
  notes: string;
}

interface Customer {
  id: string;
  name: string;
  email: string;
  phone: string;
  nationality: string;
  totalBookings: number;
  totalSpent: number;
  lastBooking: Date;
  status: 'active' | 'inactive' | 'vip';
  preferences: string[];
}

interface DashboardStats {
  totalBookings: number;
  totalRevenue: number;
  activeCustomers: number;
  pendingBookings: number;
  monthlyGrowth: number;
  conversionRate: number;
}

export default function AdminDashboard() {
  const [activeTab, setActiveTab] = useState('overview');
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [dateFilter, setDateFilter] = useState('all');
  const [selectedBooking, setSelectedBooking] = useState<Booking | null>(null);
  const [showBookingModal, setShowBookingModal] = useState(false);
  const [stats, setStats] = useState<DashboardStats>({
    totalBookings: 0,
    totalRevenue: 0,
    activeCustomers: 0,
    pendingBookings: 0,
    monthlyGrowth: 0,
    conversionRate: 0
  });

  // Sample data - replace with real API calls
  useEffect(() => {
    const sampleBookings: Booking[] = [
      {
        id: 'BK001',
        customer: {
          name: 'John Smith',
          email: 'john@example.com',
          phone: '+1-555-0123',
          nationality: 'American'
        },
        tour: {
          id: 'vietnam-12-day',
          name: '12-Day Complete Vietnam Experience',
          destination: 'Vietnam',
          duration: 12
        },
        dates: {
          departure: new Date('2024-03-15'),
          return: new Date('2024-03-27')
        },
        pricing: {
          basePrice: 2200,
          finalPrice: 1980,
          discount: 10,
          currency: 'USD'
        },
        status: 'confirmed',
        groupSize: 2,
        specialRequests: 'Vegetarian meals, airport pickup',
        createdAt: new Date('2024-01-15'),
        paymentMethod: 'Credit Card',
        notes: 'Repeat customer, very satisfied'
      },
      {
        id: 'BK002',
        customer: {
          name: 'Maria Garcia',
          email: 'maria@example.com',
          phone: '+34-555-0124',
          nationality: 'Spanish'
        },
        tour: {
          id: 'thailand-10-day',
          name: '10-Day Thailand Cultural Journey',
          destination: 'Thailand',
          duration: 10
        },
        dates: {
          departure: new Date('2024-04-20'),
          return: new Date('2024-04-30')
        },
        pricing: {
          basePrice: 1900,
          finalPrice: 1710,
          discount: 10,
          currency: 'USD'
        },
        status: 'pending',
        groupSize: 4,
        specialRequests: 'Family with children',
        createdAt: new Date('2024-01-20'),
        paymentMethod: 'Bank Transfer',
        notes: 'First-time customer, needs assistance'
      }
    ];

    const sampleCustomers: Customer[] = [
      {
        id: 'C001',
        name: 'John Smith',
        email: 'john@example.com',
        phone: '+1-555-0123',
        nationality: 'American',
        totalBookings: 3,
        totalSpent: 5940,
        lastBooking: new Date('2024-01-15'),
        status: 'vip',
        preferences: ['Cultural Tours', 'Luxury Accommodations']
      },
      {
        id: 'C002',
        name: 'Maria Garcia',
        email: 'maria@example.com',
        phone: '+34-555-0124',
        nationality: 'Spanish',
        totalBookings: 1,
        totalSpent: 1710,
        lastBooking: new Date('2024-01-20'),
        status: 'active',
        preferences: ['Family Tours', 'Adventure']
      }
    ];

    setBookings(sampleBookings);
    setCustomers(sampleCustomers);
    setStats({
      totalBookings: 156,
      totalRevenue: 234000,
      activeCustomers: 89,
      pendingBookings: 12,
      monthlyGrowth: 15.3,
      conversionRate: 12.8
    });
  }, []);

  const filteredBookings = bookings.filter(booking => {
    const matchesSearch = searchTerm === '' || 
      booking.customer.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      booking.tour.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      booking.id.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesStatus = statusFilter === 'all' || booking.status === statusFilter;
    
    return matchesSearch && matchesStatus;
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending': return 'bg-yellow-100 text-yellow-800';
      case 'confirmed': return 'bg-blue-100 text-blue-800';
      case 'paid': return 'bg-green-100 text-green-800';
      case 'completed': return 'bg-gray-100 text-gray-800';
      case 'cancelled': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'pending': return <Clock className="w-4 h-4" />;
      case 'confirmed': return <CheckCircle className="w-4 h-4" />;
      case 'paid': return <CreditCard className="w-4 h-4" />;
      case 'completed': return <CheckCircle className="w-4 h-4" />;
      case 'cancelled': return <XCircle className="w-4 h-4" />;
      default: return <Clock className="w-4 h-4" />;
    }
  };

  const handleBookingAction = (bookingId: string, action: string) => {
    setBookings(prev => prev.map(booking => 
      booking.id === bookingId 
        ? { ...booking, status: action as any }
        : booking
    ));
  };

  const exportBookings = () => {
    // Implement CSV export functionality
    console.log('Exporting bookings...');
  };

  const tabs = [
    { id: 'overview', label: 'Overview', icon: BarChart3 },
    { id: 'bookings', label: 'Bookings', icon: Calendar },
    { id: 'customers', label: 'Customers', icon: Users },
    { id: 'tours', label: 'Tours', icon: Package },
    { id: 'analytics', label: 'Analytics', icon: TrendingUp },
    { id: 'brand', label: 'Brand Safety', icon: Shield },
    { id: 'settings', label: 'Settings', icon: Settings }
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-6">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Admin Dashboard</h1>
              <p className="text-gray-600">Manage your travel business with complete control</p>
            </div>
            <div className="flex items-center space-x-4">
              <LuxuryButton variant="outline" size="sm">
                <Download className="w-4 h-4 mr-2" />
                Export Data
              </LuxuryButton>
              <LuxuryButton variant="gradient" size="sm">
                <Plus className="w-4 h-4 mr-2" />
                New Booking
              </LuxuryButton>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Navigation Tabs */}
        <div className="mb-8">
          <div className="flex space-x-1 bg-gray-100 p-1 rounded-lg">
            {tabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center px-4 py-2 rounded-md text-sm font-medium transition-all duration-200 ${
                  activeTab === tab.id
                    ? 'bg-white text-sky-600 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                }`}
              >
                <tab.icon className="w-4 h-4 mr-2" />
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Overview Tab */}
        {activeTab === 'overview' && (
          <div className="space-y-8">
            {/* Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <LuxuryCard variant="glass" className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600">Total Bookings</p>
                    <p className="text-3xl font-bold text-gray-900">{stats.totalBookings}</p>
                    <p className="text-sm text-green-600 flex items-center mt-1">
                      <TrendingUp className="w-4 h-4 mr-1" />
                      +{stats.monthlyGrowth}% this month
                    </p>
                  </div>
                  <div className="w-12 h-12 bg-sky-100 rounded-lg flex items-center justify-center">
                    <Calendar className="w-6 h-6 text-sky-600" />
                  </div>
                </div>
              </LuxuryCard>

              <LuxuryCard variant="glass" className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600">Total Revenue</p>
                    <p className="text-3xl font-bold text-gray-900">${stats.totalRevenue.toLocaleString()}</p>
                    <p className="text-sm text-green-600 flex items-center mt-1">
                      <TrendingUp className="w-4 h-4 mr-1" />
                      +12.5% this month
                    </p>
                  </div>
                  <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
                    <DollarSign className="w-6 h-6 text-green-600" />
                  </div>
                </div>
              </LuxuryCard>

              <LuxuryCard variant="glass" className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600">Active Customers</p>
                    <p className="text-3xl font-bold text-gray-900">{stats.activeCustomers}</p>
                    <p className="text-sm text-blue-600 flex items-center mt-1">
                      <Users className="w-4 h-4 mr-1" />
                      {stats.conversionRate}% conversion
                    </p>
                  </div>
                  <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                    <Users className="w-6 h-6 text-blue-600" />
                  </div>
                </div>
              </LuxuryCard>

              <LuxuryCard variant="glass" className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600">Pending Bookings</p>
                    <p className="text-3xl font-bold text-gray-900">{stats.pendingBookings}</p>
                    <p className="text-sm text-yellow-600 flex items-center mt-1">
                      <Clock className="w-4 h-4 mr-1" />
                      Needs attention
                    </p>
                  </div>
                  <div className="w-12 h-12 bg-yellow-100 rounded-lg flex items-center justify-center">
                    <AlertTriangle className="w-6 h-6 text-yellow-600" />
                  </div>
                </div>
              </LuxuryCard>
            </div>

            {/* Recent Activity */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              <LuxuryCard variant="glass" className="p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Recent Bookings</h3>
                <div className="space-y-4">
                  {bookings.slice(0, 5).map(booking => (
                    <div key={booking.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                      <div>
                        <p className="font-medium text-gray-900">{booking.customer.name}</p>
                        <p className="text-sm text-gray-600">{booking.tour.name}</p>
                      </div>
                      <div className="text-right">
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(booking.status)}`}>
                          {booking.status}
                        </span>
                        <p className="text-sm text-gray-600 mt-1">${booking.pricing.finalPrice}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </LuxuryCard>

              <LuxuryCard variant="glass" className="p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Top Customers</h3>
                <div className="space-y-4">
                  {customers.slice(0, 5).map(customer => (
                    <div key={customer.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                      <div>
                        <p className="font-medium text-gray-900">{customer.name}</p>
                        <p className="text-sm text-gray-600">{customer.totalBookings} bookings</p>
                      </div>
                      <div className="text-right">
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                          customer.status === 'vip' ? 'bg-purple-100 text-purple-800' :
                          customer.status === 'active' ? 'bg-green-100 text-green-800' :
                          'bg-gray-100 text-gray-800'
                        }`}>
                          {customer.status.toUpperCase()}
                        </span>
                        <p className="text-sm text-gray-600 mt-1">${customer.totalSpent}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </LuxuryCard>
            </div>
          </div>
        )}

        {/* Bookings Tab */}
        {activeTab === 'bookings' && (
          <div className="space-y-6">
            {/* Filters */}
            <LuxuryCard variant="glass" className="p-6">
              <div className="flex flex-wrap items-center gap-4">
                <LuxuryInput
                  type="search"
                  placeholder="Search bookings..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  icon={<Search size={20} />}
                  className="flex-1 min-w-64"
                />
                
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500"
                >
                  <option value="all">All Status</option>
                  <option value="pending">Pending</option>
                  <option value="confirmed">Confirmed</option>
                  <option value="paid">Paid</option>
                  <option value="completed">Completed</option>
                  <option value="cancelled">Cancelled</option>
                </select>

                <LuxuryButton variant="outline" size="sm" onClick={exportBookings}>
                  <Download className="w-4 h-4 mr-2" />
                  Export
                </LuxuryButton>
              </div>
            </LuxuryCard>

            {/* Bookings Table */}
            <LuxuryCard variant="glass" className="overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Booking</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Customer</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Tour</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Dates</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Price</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {filteredBookings.map(booking => (
                      <tr key={booking.id} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div>
                            <div className="text-sm font-medium text-gray-900">{booking.id}</div>
                            <div className="text-sm text-gray-500">{booking.createdAt.toLocaleDateString()}</div>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div>
                            <div className="text-sm font-medium text-gray-900">{booking.customer.name}</div>
                            <div className="text-sm text-gray-500">{booking.customer.email}</div>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div>
                            <div className="text-sm font-medium text-gray-900">{booking.tour.name}</div>
                            <div className="text-sm text-gray-500">{booking.tour.duration} days • {booking.groupSize} people</div>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm text-gray-900">{booking.dates.departure.toLocaleDateString()}</div>
                          <div className="text-sm text-gray-500">to {booking.dates.return.toLocaleDateString()}</div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm font-medium text-gray-900">${booking.pricing.finalPrice}</div>
                          {booking.pricing.discount > 0 && (
                            <div className="text-sm text-green-600">{booking.pricing.discount}% off</div>
                          )}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(booking.status)}`}>
                            {getStatusIcon(booking.status)}
                            <span className="ml-1 capitalize">{booking.status}</span>
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                          <div className="flex items-center space-x-2">
                            <button
                              onClick={() => {
                                setSelectedBooking(booking);
                                setShowBookingModal(true);
                              }}
                              className="text-sky-600 hover:text-sky-900"
                            >
                              <Eye className="w-4 h-4" />
                            </button>
                            <button className="text-gray-600 hover:text-gray-900">
                              <Edit className="w-4 h-4" />
                            </button>
                            <button className="text-red-600 hover:text-red-900">
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </LuxuryCard>
          </div>
        )}

        {/* Customers Tab */}
        {activeTab === 'customers' && (
          <div className="space-y-6">
            <LuxuryCard variant="glass" className="p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Customer Management</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {customers.map(customer => (
                  <div key={customer.id} className="p-4 border border-gray-200 rounded-lg">
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="font-medium text-gray-900">{customer.name}</h4>
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                        customer.status === 'vip' ? 'bg-purple-100 text-purple-800' :
                        customer.status === 'active' ? 'bg-green-100 text-green-800' :
                        'bg-gray-100 text-gray-800'
                      }`}>
                        {customer.status.toUpperCase()}
                      </span>
                    </div>
                    <div className="space-y-2 text-sm text-gray-600">
                      <div className="flex items-center">
                        <Mail className="w-4 h-4 mr-2" />
                        {customer.email}
                      </div>
                      <div className="flex items-center">
                        <Phone className="w-4 h-4 mr-2" />
                        {customer.phone}
                      </div>
                      <div className="flex items-center">
                        <Globe className="w-4 h-4 mr-2" />
                        {customer.nationality}
                      </div>
                      <div className="flex items-center justify-between pt-2 border-t">
                        <span>{customer.totalBookings} bookings</span>
                        <span className="font-medium">${customer.totalSpent}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </LuxuryCard>
          </div>
        )}

        {/* Brand Safety Tab */}
        {activeTab === 'brand' && (
          <BrandCompliance />
        )}

        {/* Settings Tab */}
        {activeTab === 'settings' && (
          <div className="space-y-6">
            <LuxuryCard variant="glass" className="p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">System Settings</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <h4 className="font-medium text-gray-900 mb-3">Pricing Settings</h4>
                  <div className="space-y-3">
                    <LuxuryButton variant="outline" size="sm" className="w-full">
                      <DollarSign className="w-4 h-4 mr-2" />
                      Manage Dynamic Pricing
                    </LuxuryButton>
                    <LuxuryButton variant="outline" size="sm" className="w-full">
                      <TrendingUp className="w-4 h-4 mr-2" />
                      Set Seasonal Rates
                    </LuxuryButton>
                  </div>
                </div>
                <div>
                  <h4 className="font-medium text-gray-900 mb-3">Tour Management</h4>
                  <div className="space-y-3">
                    <LuxuryButton variant="outline" size="sm" className="w-full">
                      <Package className="w-4 h-4 mr-2" />
                      Manage Tours
                    </LuxuryButton>
                    <LuxuryButton variant="outline" size="sm" className="w-full">
                      <Calendar className="w-4 h-4 mr-2" />
                      Set Availability
                    </LuxuryButton>
                  </div>
                </div>
              </div>
            </LuxuryCard>
          </div>
        )}
      </div>

      {/* Booking Detail Modal */}
      {showBookingModal && selectedBooking && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-semibold text-gray-900">Booking Details</h3>
              <button
                onClick={() => setShowBookingModal(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <XCircle className="w-6 h-6" />
              </button>
            </div>

            <div className="space-y-6">
              {/* Customer Info */}
              <div>
                <h4 className="font-medium text-gray-900 mb-3">Customer Information</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm text-gray-600">Name</label>
                    <p className="font-medium">{selectedBooking.customer.name}</p>
                  </div>
                  <div>
                    <label className="block text-sm text-gray-600">Email</label>
                    <p className="font-medium">{selectedBooking.customer.email}</p>
                  </div>
                  <div>
                    <label className="block text-sm text-gray-600">Phone</label>
                    <p className="font-medium">{selectedBooking.customer.phone}</p>
                  </div>
                  <div>
                    <label className="block text-sm text-gray-600">Nationality</label>
                    <p className="font-medium">{selectedBooking.customer.nationality}</p>
                  </div>
                </div>
              </div>

              {/* Tour Info */}
              <div>
                <h4 className="font-medium text-gray-900 mb-3">Tour Information</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm text-gray-600">Tour</label>
                    <p className="font-medium">{selectedBooking.tour.name}</p>
                  </div>
                  <div>
                    <label className="block text-sm text-gray-600">Duration</label>
                    <p className="font-medium">{selectedBooking.tour.duration} days</p>
                  </div>
                  <div>
                    <label className="block text-sm text-gray-600">Group Size</label>
                    <p className="font-medium">{selectedBooking.groupSize} people</p>
                  </div>
                  <div>
                    <label className="block text-sm text-gray-600">Status</label>
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(selectedBooking.status)}`}>
                      {getStatusIcon(selectedBooking.status)}
                      <span className="ml-1 capitalize">{selectedBooking.status}</span>
                    </span>
                  </div>
                </div>
              </div>

              {/* Pricing */}
              <div>
                <h4 className="font-medium text-gray-900 mb-3">Pricing</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm text-gray-600">Base Price</label>
                    <p className="font-medium">${selectedBooking.pricing.basePrice}</p>
                  </div>
                  <div>
                    <label className="block text-sm text-gray-600">Final Price</label>
                    <p className="font-medium text-green-600">${selectedBooking.pricing.finalPrice}</p>
                  </div>
                  <div>
                    <label className="block text-sm text-gray-600">Discount</label>
                    <p className="font-medium">{selectedBooking.pricing.discount}%</p>
                  </div>
                  <div>
                    <label className="block text-sm text-gray-600">Payment Method</label>
                    <p className="font-medium">{selectedBooking.paymentMethod}</p>
                  </div>
                </div>
              </div>

              {/* Special Requests */}
              {selectedBooking.specialRequests && (
                <div>
                  <h4 className="font-medium text-gray-900 mb-3">Special Requests</h4>
                  <p className="text-gray-700">{selectedBooking.specialRequests}</p>
                </div>
              )}

              {/* Notes */}
              {selectedBooking.notes && (
                <div>
                  <h4 className="font-medium text-gray-900 mb-3">Notes</h4>
                  <p className="text-gray-700">{selectedBooking.notes}</p>
                </div>
              )}

              {/* Actions */}
              <div className="flex justify-end space-x-3 pt-6 border-t">
                <LuxuryButton variant="outline" onClick={() => setShowBookingModal(false)}>
                  Close
                </LuxuryButton>
                <LuxuryButton variant="gradient" onClick={() => {
                  // Handle booking action
                  console.log('Processing booking...');
                }}>
                  Process Booking
                </LuxuryButton>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
