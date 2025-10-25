import { Award, Heart, Users, TrendingUp } from 'lucide-react';

export default function About() {
  const stats = [
    { number: '10,000+', label: 'Happy Travelers' },
    { number: '50+', label: 'Destinations' },
    { number: '15', label: 'Years Experience' },
    { number: '98%', label: 'Satisfaction Rate' },
  ];

  const values = [
    {
      icon: <Award className="w-10 h-10 text-sky-500" />,
      title: 'Excellence',
      description: 'We are committed to delivering exceptional travel experiences that exceed expectations.',
    },
    {
      icon: <Heart className="w-10 h-10 text-sky-500" />,
      title: 'Passion',
      description: 'Our love for travel drives us to create unforgettable journeys for every client.',
    },
    {
      icon: <Users className="w-10 h-10 text-sky-500" />,
      title: 'Partnership',
      description: 'Building lasting relationships with clients, partners, and local communities worldwide.',
    },
    {
      icon: <TrendingUp className="w-10 h-10 text-sky-500" />,
      title: 'Innovation',
      description: 'Continuously evolving to bring you the latest trends and destinations in luxury travel.',
    },
  ];

  return (
    <div className="min-h-screen bg-white pt-20">
      <section className="relative h-96 flex items-center justify-center overflow-hidden">
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{
            backgroundImage: 'url(https://images.pexels.com/photos/346885/pexels-photo-346885.jpeg)',
          }}
        />
        <div className="absolute inset-0 bg-black/50" />

        <div className="relative z-10 text-center px-4 max-w-4xl mx-auto">
          <h1 className="text-5xl md:text-6xl font-bold text-white mb-4">
            About TRAVERION
          </h1>
          <p className="text-xl text-white/90">
            Your trusted partner in creating extraordinary travel experiences
          </p>
        </div>
      </section>

      <section className="py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center mb-20">
            <div>
              <h2 className="text-4xl font-bold text-gray-900 mb-6">Our Story</h2>
              <div className="space-y-4 text-gray-600 leading-relaxed">
                <p>
                  Founded in Finland with a global vision, TRAVERION was born from a passion for
                  connecting people with the world's most incredible destinations. We believe that
                  travel is more than just visiting new places – it's about creating meaningful
                  experiences that enrich lives.
                </p>
                <p>
                  Our team of travel experts brings together decades of experience in crafting
                  personalized journeys. Whether you're departing from Finland or anywhere else in
                  the world, we're dedicated to making your travel dreams a reality.
                </p>
                <p>
                  At TRAVERION, we go beyond ordinary to curate exceptional holiday packages that
                  combine luxury, authenticity, and adventure. Every destination is handpicked,
                  every accommodation carefully vetted, and every itinerary thoughtfully designed.
                </p>
              </div>
            </div>

            <div className="relative h-96 rounded-xl overflow-hidden shadow-2xl">
              <img
                src="https://images.pexels.com/photos/346885/pexels-photo-346885.jpeg"
                alt="Travel"
                className="w-full h-full object-cover"
              />
            </div>
          </div>

          <div className="bg-sky-500 rounded-2xl p-12 mb-20">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
              {stats.map((stat, index) => (
                <div key={index} className="text-center">
                  <div className="text-4xl md:text-5xl font-bold text-white mb-2">
                    {stat.number}
                  </div>
                  <div className="text-white/90 text-sm md:text-base">{stat.label}</div>
                </div>
              ))}
            </div>
          </div>

          <div>
            <h2 className="text-4xl font-bold text-gray-900 mb-4 text-center">Our Values</h2>
            <p className="text-gray-600 text-center mb-12 max-w-3xl mx-auto">
              These core principles guide everything we do at TRAVERION
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
              {values.map((value, index) => (
                <div
                  key={index}
                  className="bg-white p-8 rounded-xl shadow-md hover:shadow-xl transition-all duration-300 transform hover:-translate-y-1"
                >
                  <div className="mb-4">{value.icon}</div>
                  <h3 className="text-xl font-semibold mb-3 text-gray-900">{value.title}</h3>
                  <p className="text-gray-600 text-sm leading-relaxed">{value.description}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="py-20 bg-gray-50">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-4xl font-bold text-gray-900 mb-6">Why Choose TRAVERION?</h2>
          <p className="text-gray-600 text-lg leading-relaxed mb-8">
            We understand that your time and trust are precious. That's why we're committed to
            providing not just holidays, but transformative experiences that create lasting
            memories. From the moment you contact us to the day you return home, we're with you
            every step of the journey.
          </p>
          <button className="bg-sky-500 text-white px-8 py-4 rounded-lg text-lg font-semibold hover:bg-sky-600 transition-all duration-300 transform hover:scale-105 shadow-lg">
            Start Your Journey
          </button>
        </div>
      </section>
    </div>
  );
}
