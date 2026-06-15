
import React from 'react';

interface Props {
  // Fixed: Change return type to any to support complex translation values
  t: (key: string) => any;
}

const SplashScreen: React.FC<Props> = ({ t }) => {
  return (
    <div className="fixed inset-0 bg-slate-950 flex flex-col items-center justify-center overflow-hidden z-50">
      {/* Smoke Elements */}
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="w-[500px] h-[500px] bg-purple-600/30 rounded-full blur-[100px] animate-pulse absolute -translate-x-1/4"></div>
        <div className="w-[500px] h-[500px] bg-green-500/20 rounded-full blur-[100px] animate-pulse absolute translate-x-1/4 delay-700"></div>
        <div className="w-[300px] h-[300px] bg-purple-400/20 rounded-full blur-[80px] animate-bounce absolute top-1/4"></div>
      </div>

      <div className="relative z-10 text-center px-4">
        <h1 className="text-4xl md:text-6xl font-bold bg-gradient-to-r from-purple-400 to-green-400 bg-clip-text text-transparent animate-[fadeIn_2s_ease-in-out]">
          AtriosWork
        </h1>
        <p className="mt-8 text-2xl md:text-3xl font-light text-slate-300 animate-[slideUp_3s_ease-out_forwards] opacity-0">
          "{t('splash.tagline')}"
        </p>
      </div>

      <style>{`
        @keyframes slideUp {
          0% { transform: translateY(50px); opacity: 0; filter: blur(10px); }
          50% { opacity: 1; filter: blur(0px); }
          100% { transform: translateY(0); opacity: 1; filter: blur(0px); }
        }
        @keyframes fadeIn {
          0% { opacity: 0; transform: scale(0.9); }
          100% { opacity: 1; transform: scale(1); }
        }
      `}</style>
    </div>
  );
};

export default SplashScreen;
