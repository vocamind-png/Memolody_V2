import React from 'react';
import { BookOpen } from 'lucide-react';

const OpenSourceCreditsCard: React.FC = () => {
  return (
    <div className="p-6 rounded-[28px] bg-white/5 border border-white/10 mt-4">
      <div className="flex items-center gap-3 mb-4">
        <BookOpen size={20} className="text-zinc-400" />
        <h3 className="text-sm font-black uppercase text-white">Open Source Acknowledgements</h3>
      </div>
      <div className="text-[10px] text-zinc-400 space-y-4 font-mono leading-relaxed">
        <div>
          <strong className="text-white">AutoHarmony (ekzhang/harmony)</strong><br />
          Copyright (c) 2019, Eric Zhang<br />
          All rights reserved.<br />
          Redistribution and use in source and binary forms, with or without modification, are permitted provided that the following conditions are met:
          <ul className="list-disc pl-4 mt-2">
            <li>Redistributions of source code must retain the above copyright notice, this list of conditions and the following disclaimer.</li>
            <li>Redistributions in binary form must reproduce the above copyright notice, this list of conditions and the following disclaimer in the documentation and/or other materials provided with the distribution.</li>
            <li>Neither the name of the copyright holder nor the names of its contributors may be used to endorse or promote products derived from this software without specific prior written permission.</li>
          </ul>
        </div>
      </div>
    </div>
  );
};

export default OpenSourceCreditsCard;
