import { useState, useEffect } from 'react';

const CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789@#$%&*+<>_';

export function useScramble(text: string, speed: number = 30) {
  const [displayText, setDisplayText] = useState(text);

  useEffect(() => {
    let iteration = 0;
    const maxIterations = text.length;
    
    const interval = setInterval(() => {
      setDisplayText(text.split('').map((char, index) => {
        if (index < iteration || char === ' ') {
          return char;
        }
        return CHARS[Math.floor(Math.random() * CHARS.length)];
      }).join(''));
      
      if (iteration >= maxIterations) {
        clearInterval(interval);
        setDisplayText(text);
      }
      
      iteration += 1 / 3; // Scramble for a few frames per character
    }, speed);

    return () => clearInterval(interval);
  }, [text, speed]);

  return displayText;
}
