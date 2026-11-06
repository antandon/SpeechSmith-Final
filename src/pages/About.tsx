
import React from 'react';
import MainLayout from '@/layouts/MainLayout';
import SiteHeader from '@/components/SiteHeader';
import SiteFooter from '@/components/SiteFooter';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Users, Target, Heart, Mic, Brain, Zap } from 'lucide-react';
import { Carousel, CarouselContent, CarouselItem, CarouselNext, CarouselPrevious } from '@/components/ui/carousel';
import Autoplay from 'embla-carousel-autoplay';
import { Quote } from 'lucide-react';
import logo1 from '@/assets/organizations/logo1.png';
import logo2 from '@/assets/organizations/logo2.jpg';
import logo3 from '@/assets/organizations/logo3.png';
import logo4 from '@/assets/organizations/logo4.png';
import logo5 from '@/assets/organizations/logo5.jpg';
import logo6 from '@/assets/organizations/logo6.png';
import logo7 from '@/assets/organizations/logo7.jpg';
import logo8 from '@/assets/organizations/logo8.png';
import logo9 from '@/assets/organizations/logo9.png';
import logo10 from '@/assets/organizations/logo10.jpg';
import logo11 from '@/assets/organizations/logo11.png';
import logo12 from '@/assets/organizations/logo12.png';
import logo13 from '@/assets/organizations/logo13.png';
import logo14 from '@/assets/organizations/logo14.jpg';
import logo15 from '@/assets/organizations/logo15.png';
import logo16 from '@/assets/organizations/logo16.jpg';
import founderImage from '@/assets/founder-anoushka.jpg';

const About: React.FC = () => {
  return (
    <MainLayout>
      <SiteHeader />
      
      <div className="container mx-auto py-16">
        {/* Hero Section */}
        <div className="text-center mb-16">
          <h1 className="text-3xl md:text-4xl font-bold text-gray-900 mb-6">
            About SpeechSmith
          </h1>
          <p className="text-xl text-gray-600 max-w-3xl mx-auto leading-relaxed">
            Empowering speakers worldwide with AI-driven speech analysis and personalized improvement recommendations.
          </p>
        </div>

        {/* Mission Section */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 mb-16">
          <div className="space-y-6">
            <h2 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
              <Target className="h-8 w-8 text-primary" />
              Our Mission
            </h2>
            <p className="text-gray-700 leading-relaxed">
              At SpeechSmith, we believe that effective communication is the cornerstone of success in both personal and professional spheres. Our mission is to democratize access to high-quality speech coaching through cutting-edge AI technology.
            </p>
            <p className="text-gray-700 leading-relaxed">
              We combine advanced artificial intelligence with proven speech science to provide instant, detailed feedback on pronunciation, pace, clarity, and emotional delivery. Our goal is to help every user become a more confident and effective communicator.
            </p>
          </div>
          
          <div className="space-y-6">
            <h2 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
              <Heart className="h-8 w-8 text-primary" />
              Our Values
            </h2>
            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <div className="w-2 h-2 bg-primary rounded-full mt-2"></div>
                <div>
                  <h4 className="font-semibold text-gray-900">Accessibility</h4>
                  <p className="text-gray-600">Making professional speech coaching available to everyone, everywhere.</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-2 h-2 bg-primary rounded-full mt-2"></div>
                <div>
                  <h4 className="font-semibold text-gray-900">Innovation</h4>
                  <p className="text-gray-600">Continuously advancing our AI technology to provide the most accurate and helpful feedback.</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-2 h-2 bg-primary rounded-full mt-2"></div>
                <div>
                  <h4 className="font-semibold text-gray-900">Privacy</h4>
                  <p className="text-gray-600">Protecting user data with the highest standards of security and confidentiality.</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Features Section */}
        <div className="mb-16">
          <h2 className="text-3xl font-bold text-center text-gray-900 mb-12">
            Why Choose SpeechSmith?
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <Card className="text-center">
              <CardHeader>
                <Mic className="h-12 w-12 text-primary mx-auto mb-4" />
                <CardTitle>Advanced Speech Analysis</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-gray-600">
                  Our AI analyzes pronunciation, pace, pitch, and emotional tone to provide comprehensive feedback on your speaking performance.
                </p>
              </CardContent>
            </Card>

            <Card className="text-center">
              <CardHeader>
                <Brain className="h-12 w-12 text-primary mx-auto mb-4" />
                <CardTitle>Personalized Insights</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-gray-600">
                  Receive tailored recommendations and practice exercises based on your unique speaking patterns and improvement areas.
                </p>
              </CardContent>
            </Card>

            <Card className="text-center">
              <CardHeader>
                <Zap className="h-12 w-12 text-primary mx-auto mb-4" />
                <CardTitle>Instant Feedback</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-gray-600">
                  Get immediate analysis and actionable insights to improve your speaking skills in real-time.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Team Section */}
        <div className="mb-16">
          <h2 className="text-3xl font-bold text-center text-gray-900 mb-12">
            Meet Our Founder
          </h2>
          <div className="max-w-4xl mx-auto">
            <Card className="overflow-hidden">
              <CardContent className="p-8">
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-center">
                  <div className="lg:col-span-1">
                    <div className="w-48 h-48 mx-auto overflow-hidden rounded-full">
                      <img src={founderImage} alt="Anoushka Tandon - Founder & CEO" className="w-full h-full object-cover" />
                    </div>
                  </div>
                  <div className="lg:col-span-2 space-y-6">
                    <div>
                      <h3 className="text-2xl font-bold text-gray-900 mb-2">Anoushka Tandon</h3>
                      <p className="text-primary font-medium mb-4">Founder & CEO</p>
                      <div className="flex flex-wrap gap-2 mb-4">
                        <Badge variant="secondary">IB Diploma Student</Badge>
                        <Badge variant="secondary">Published Researcher</Badge>
                        <Badge variant="secondary">Dhirubhai Ambani International School</Badge>
                        <Badge variant="secondary">Award-Winning Innovator</Badge>
                      </div>
                    </div>
                    <p className="text-gray-700 leading-relaxed">
                      Anoushka is a passionate advocate for democratizing access to quality education through technology. 
                      A IB Diploma student at Dhirubhai Ambani International School, she brings deep expertise in artificial 
                      intelligence and a commitment to creating tools that empower learners worldwide.
                    </p>
                    <p className="text-gray-700 leading-relaxed">
                      A researcher with publications in prestigious journals, Anoushka has won multiple national and 
                      international awards. Her work spans AI, healthcare innovation, and educational technology, with 
                      a consistent focus on creating measurable social impact.
                    </p>
                    <p className="text-gray-700 leading-relaxed">
                      Her vision for SpeechSmith stems from recognizing the critical role that effective communication 
                      plays in personal and professional success, and the need to make high-quality speech coaching 
                      accessible to everyone, regardless of their background or location.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Stats Section */}
        <div className="text-center mb-16">
          <h2 className="text-3xl font-bold text-gray-900 mb-12">
            Impact by Numbers
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-12">
            <div className="space-y-2">
              <div className="text-4xl font-bold text-primary">45,000+</div>
              <div className="text-gray-600">Students Empowered</div>
            </div>
            <div className="space-y-2">
              <div className="text-4xl font-bold text-primary">20+</div>
              <div className="text-gray-600">Institutional Partnerships</div>
            </div>
            <div className="space-y-2">
              <div className="text-4xl font-bold text-primary">100K+ Hours</div>
              <div className="text-gray-600">Total Time Spent</div>
            </div>
          </div>
          
          {/* Recognition Section */}
          <div className="max-w-4xl mx-auto">
            <p className="text-gray-700 text-sm">
              Serving students from Schools, NGOs, Colleges, Vocational Training Centres, and State-level universities with a special focus on India
            </p>
          </div>
        </div>

        {/* Testimonials Section */}
        <div className="mb-16">
          <h2 className="text-3xl font-bold text-center text-gray-900 mb-12">
            What Educators Say About Us
          </h2>
          <div className="max-w-3xl mx-auto">
            <Carousel
              opts={{
                align: "start",
                loop: true,
              }}
              plugins={[
                Autoplay({
                  delay: 5000,
                })
              ]}
              className="w-full"
            >
              <CarouselContent>
                <CarouselItem>
                  <Card className="h-full">
                    <CardContent className="p-8">
                      <Quote className="h-10 w-10 text-primary mb-4" />
                      <p className="text-gray-700 leading-relaxed mb-6 italic">
                        "Your platform has significantly enhanced our students' English fluency, confidence in public speaking, and debating ability. The AI-powered feedback of SpeechSmith has provided our learners with exposure to global standards of communication. In today's interconnected world, fluency in English is not only a medium of expression but also a gateway to future opportunities."
                      </p>
                      <div className="border-t pt-4">
                        <p className="font-semibold text-gray-900">Principal</p>
                        <p className="text-sm text-gray-600">Bal Bharati Public School, Phase-III Dugri, Ludhiana</p>
                      </div>
                    </CardContent>
                  </Card>
                </CarouselItem>
                
                <CarouselItem>
                  <Card className="h-full">
                    <CardContent className="p-8">
                      <Quote className="h-10 w-10 text-primary mb-4" />
                      <p className="text-gray-700 leading-relaxed mb-6 italic">
                        "The use of SpeechSmith has significantly enhanced the English communication skills of our students and college students and vocational skill trainees. It has not only improved their spoken English but has also contributed to building their confidence, boosting employability readiness, and helping them express themselves more effectively in academic and social settings."
                      </p>
                      <div className="border-t pt-4">
                        <p className="font-semibold text-gray-900">Mrs. Neelam G. Prabhu, Principal</p>
                        <p className="text-sm text-gray-600">V.P. Vidyanidhi High School & Commerce College, Juhu, Mumbai</p>
                      </div>
                    </CardContent>
                  </Card>
                </CarouselItem>
                
                <CarouselItem>
                  <Card className="h-full">
                    <CardContent className="p-8">
                      <Quote className="h-10 w-10 text-primary mb-4" />
                      <p className="text-gray-700 leading-relaxed mb-6 italic">
                        "With minimal setup and onboarding, students could record themselves, receive auto-generated transcripts with pronunciation feedback, and engage in repeated practice. The AI feedback not only corrected errors but helped students understand rhythm, expression, and modulation. As a result: significant improvement in communication. Your leadership has been instrumental not just as a technologist, but as someone who understands the emotional barriers students face in finding their voice."
                      </p>
                      <div className="border-t pt-4">
                        <p className="font-semibold text-gray-900">Nidhi Chaturvedi, Director</p>
                        <p className="text-sm text-gray-600">Nisarg Foundation</p>
                      </div>
                    </CardContent>
                  </Card>
                </CarouselItem>
                
                <CarouselItem>
                  <Card className="h-full">
                    <CardContent className="p-8">
                      <Quote className="h-10 w-10 text-primary mb-4" />
                      <p className="text-gray-700 leading-relaxed mb-6 italic">
                        "The use of SpeechSmith will enable our students—especially those from underprivileged backgrounds—to strengthen their English-speaking abilities and build greater confidence in their communication skills. This initiative will positively impact our adopted village and Zilla Parishad schools across Maharashtra and Uttar Pradesh, reaching children with the support of volunteer warriors."
                      </p>
                      <div className="border-t pt-4">
                        <p className="font-semibold text-gray-900">Rishikesh Tripathi, President & Founder</p>
                        <p className="text-sm text-gray-600">Ayushman Foundation India</p>
                      </div>
                    </CardContent>
                  </Card>
                </CarouselItem>
                
                <CarouselItem>
                  <Card className="h-full">
                    <CardContent className="p-8">
                      <Quote className="h-10 w-10 text-primary mb-4" />
                      <p className="text-gray-700 leading-relaxed mb-6 italic">
                        "SpeechSmith will help us support our students in developing their English-speaking abilities and building confidence, particularly among those from underprivileged backgrounds. Our organization works with students who will gain access to the platform as a part of our learning program."
                      </p>
                      <div className="border-t pt-4">
                        <p className="font-semibold text-gray-900">Pavan Kesari, Founder</p>
                        <p className="text-sm text-gray-600">Sparkling Wings NGO, Dahisar East, Mumbai</p>
                      </div>
                    </CardContent>
                  </Card>
                </CarouselItem>
              </CarouselContent>
              <CarouselPrevious />
              <CarouselNext />
            </Carousel>
          </div>
        </div>

        {/* Organizations Section */}
        <div className="mb-16">
          <h2 className="text-3xl font-bold text-center text-gray-900 mb-12">
            Organizations We've Helped
          </h2>
          <div className="max-w-6xl mx-auto px-12">
            <Carousel
              opts={{
                align: "start",
                loop: true,
              }}
              plugins={[
                Autoplay({
                  delay: 2000,
                })
              ]}
              className="w-full"
            >
              <CarouselContent>
                <CarouselItem className="md:basis-1/3 lg:basis-1/5">
                  <div className="flex items-center justify-center p-6 h-48 bg-card rounded-lg border hover:border-primary transition-colors">
                    <img src={logo1} alt="Organization logo" className="max-h-32 max-w-full object-contain" />
                  </div>
                </CarouselItem>
                <CarouselItem className="md:basis-1/3 lg:basis-1/5">
                  <div className="flex items-center justify-center p-6 h-48 bg-card rounded-lg border hover:border-primary transition-colors">
                    <img src={logo2} alt="Organization logo" className="max-h-32 max-w-full object-contain" />
                  </div>
                </CarouselItem>
                <CarouselItem className="md:basis-1/3 lg:basis-1/5">
                  <div className="flex items-center justify-center p-6 h-48 bg-card rounded-lg border hover:border-primary transition-colors">
                    <img src={logo3} alt="Organization logo" className="max-h-32 max-w-full object-contain" />
                  </div>
                </CarouselItem>
                <CarouselItem className="md:basis-1/3 lg:basis-1/5">
                  <div className="flex items-center justify-center p-6 h-48 bg-card rounded-lg border hover:border-primary transition-colors">
                    <img src={logo4} alt="Organization logo" className="max-h-32 max-w-full object-contain" />
                  </div>
                </CarouselItem>
                <CarouselItem className="md:basis-1/3 lg:basis-1/5">
                  <div className="flex items-center justify-center p-6 h-48 bg-card rounded-lg border hover:border-primary transition-colors">
                    <img src={logo5} alt="Organization logo" className="max-h-32 max-w-full object-contain" />
                  </div>
                </CarouselItem>
                <CarouselItem className="md:basis-1/3 lg:basis-1/5">
                  <div className="flex items-center justify-center p-6 h-48 bg-card rounded-lg border hover:border-primary transition-colors">
                    <img src={logo6} alt="Organization logo" className="max-h-32 max-w-full object-contain" />
                  </div>
                </CarouselItem>
                <CarouselItem className="md:basis-1/3 lg:basis-1/5">
                  <div className="flex items-center justify-center p-6 h-48 bg-card rounded-lg border hover:border-primary transition-colors">
                    <img src={logo7} alt="Organization logo" className="max-h-32 max-w-full object-contain" />
                  </div>
                </CarouselItem>
                <CarouselItem className="md:basis-1/3 lg:basis-1/5">
                  <div className="flex items-center justify-center p-6 h-48 bg-card rounded-lg border hover:border-primary transition-colors">
                    <img src={logo8} alt="Organization logo" className="max-h-32 max-w-full object-contain" />
                  </div>
                </CarouselItem>
                <CarouselItem className="md:basis-1/3 lg:basis-1/5">
                  <div className="flex items-center justify-center p-6 h-48 bg-card rounded-lg border hover:border-primary transition-colors">
                    <img src={logo9} alt="Organization logo" className="max-h-32 max-w-full object-contain" />
                  </div>
                </CarouselItem>
                <CarouselItem className="md:basis-1/3 lg:basis-1/5">
                  <div className="flex items-center justify-center p-6 h-48 bg-card rounded-lg border hover:border-primary transition-colors">
                    <img src={logo10} alt="Organization logo" className="max-h-32 max-w-full object-contain" />
                  </div>
                </CarouselItem>
                <CarouselItem className="md:basis-1/3 lg:basis-1/5">
                  <div className="flex items-center justify-center p-6 h-48 bg-card rounded-lg border hover:border-primary transition-colors">
                    <img src={logo11} alt="Organization logo" className="max-h-32 max-w-full object-contain" />
                  </div>
                </CarouselItem>
                <CarouselItem className="md:basis-1/3 lg:basis-1/5">
                  <div className="flex items-center justify-center p-6 h-48 bg-card rounded-lg border hover:border-primary transition-colors">
                    <img src={logo12} alt="Organization logo" className="max-h-32 max-w-full object-contain" />
                  </div>
                </CarouselItem>
                <CarouselItem className="md:basis-1/3 lg:basis-1/5">
                  <div className="flex items-center justify-center p-6 h-48 bg-card rounded-lg border hover:border-primary transition-colors">
                    <img src={logo13} alt="Organization logo" className="max-h-32 max-w-full object-contain" />
                  </div>
                </CarouselItem>
                <CarouselItem className="md:basis-1/3 lg:basis-1/5">
                  <div className="flex items-center justify-center p-6 h-48 bg-card rounded-lg border hover:border-primary transition-colors">
                    <img src={logo14} alt="Organization logo" className="max-h-32 max-w-full object-contain" />
                  </div>
                </CarouselItem>
                <CarouselItem className="md:basis-1/3 lg:basis-1/5">
                  <div className="flex items-center justify-center p-6 h-48 bg-card rounded-lg border hover:border-primary transition-colors">
                    <img src={logo15} alt="Organization logo" className="max-h-32 max-w-full object-contain" />
                  </div>
                </CarouselItem>
                <CarouselItem className="md:basis-1/3 lg:basis-1/5">
                  <div className="flex items-center justify-center p-6 h-48 bg-card rounded-lg border hover:border-primary transition-colors">
                    <img src={logo16} alt="Organization logo" className="max-h-32 max-w-full object-contain" />
                  </div>
                </CarouselItem>
              </CarouselContent>
              <CarouselPrevious />
              <CarouselNext />
            </Carousel>
          </div>
        </div>

        {/* CTA Section */}
        <div className="text-center">
          <Card className="bg-primary text-white">
            <CardContent className="p-12">
              <h2 className="text-3xl font-bold mb-4">Ready to Transform Your Speaking?</h2>
              <p className="text-xl mb-8 opacity-90">
                Join thousands of users who have improved their communication skills with SpeechSmith.
              </p>
              <div className="space-y-4">
                <p className="text-sm opacity-80">
                  Experience the power of AI-driven speech analysis and take your communication to the next level.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <SiteFooter />
    </MainLayout>
  );
};

export default About;
