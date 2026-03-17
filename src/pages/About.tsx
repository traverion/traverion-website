import { ArrowLeft } from 'lucide-react';

export default function About() {

  return (
    <div className="min-h-screen bg-gray-50 pt-20">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <button
          type="button"
          onClick={() => window.history.back()}
          className="flex items-center gap-2 text-gray-600 hover:text-finland mb-8"
        >
          <ArrowLeft className="w-4 h-4" />
          Back
        </button>
        <h1 className="text-3xl font-bold text-gray-900 mb-6">About Us</h1>
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-8 space-y-6 text-gray-700">
          <p className="text-lg">
            Traverion is a tours and activities platform where travelers can discover and book experiences worldwide, and where local providers can list and manage their offerings.
          </p>
          <p>
            We are based in Finland and focused on connecting travelers with authentic, bookable tours and activities. Our platform supports free cancellation on many experiences and a best-price guarantee.
          </p>
          <p>
            For questions or partnership inquiries, please visit our <a href="/contact" className="text-finland hover:underline">Contact</a> page.
          </p>
        </div>
      </div>
    </div>
  );
}
