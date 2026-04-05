import { useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { FiCheckCircle, FiXCircle, FiArrowRight, FiBookOpen } from 'react-icons/fi';
import './index.css';

// Markdown components mapper to replace LaTeX delimeters for remark-math
const MarkdownWithMath = ({ text }) => {
  // We need to ensure the \\( and \\) are completely standard $ and $$ for remark-math if we wanted, 
  // but remark-math handles $...$ and $$...$ out of the box nicely.
  // Our data might have LaTeX pure text or wrapped in $ if we're lucky.
  // If the extracted text from Gemini lacks $ delimiters, we might need heuristics or just rely on the pure latex rendering.
  // Let's implement a robust renderer.
  
  // Normalize string for safety
  const safeText = text || '';
  
  return (
    <ReactMarkdown
      remarkPlugins={[remarkMath]}
      rehypePlugins={[rehypeKatex]}
      components={{
        p: ({node, ...props}) => <span {...props} /> // Render p as span to prevent block breaks in options
      }}
    >
      {safeText}
    </ReactMarkdown>
  );
};


function App() {
  const [questions, setQuestions] = useState([]);
  const [filteredPool, setFilteredPool] = useState([]);
  const [currentQIndex, setCurrentQIndex] = useState(0);
  
  const [subject, setSubject] = useState('All');
  const [subjects, setSubjects] = useState([]);
  
  // State for attempting
  const [selectedOption, setSelectedOption] = useState(null);
  const [isAnswered, setIsAnswered] = useState(false);
  const [score, setScore] = useState({ correct: 0, wrong: 0, total: 0 });

  useEffect(() => {
    // Fetch our purely static massive JSON file!
    fetch('./questions_data.json')
      .then(res => res.json())
      .then(data => {
        // Filter out non-MCQs for the endless test mode
        const mcqs = data.filter(q => q.question_type === 'MCQ' || q.question_type === 'QuestionType.MCQ');
        setQuestions(mcqs);
        setFilteredPool(shuffleArray([...mcqs]));
        
        // Extract unique subjects
        const uniqueSubjects = [...new Set(mcqs.map(q => q.subject).filter(Boolean))];
        setSubjects(['All', ...uniqueSubjects]);
      })
      .catch(err => console.error("Failed to load questions database.", err));
  }, []);

  // Filter effect
  useEffect(() => {
    if (questions.length === 0) return;
    
    let pool = questions;
    if (subject !== 'All') {
      pool = questions.filter(q => q.subject === subject);
    }
    
    setFilteredPool(shuffleArray([...pool]));
    setCurrentQIndex(0);
    resetQuestionState();
  }, [subject, questions]);

  const resetQuestionState = () => {
    setSelectedOption(null);
    setIsAnswered(false);
  };

  const nextQuestion = () => {
    setCurrentQIndex((prev) => (prev + 1) % filteredPool.length);
    resetQuestionState();
  };

  const handleOptionClick = (optionId, isCorrect) => {
    if (isAnswered) return; // Prevent double clicking
    
    setSelectedOption(optionId);
    setIsAnswered(true);
    
    setScore(prev => ({
      ...prev,
      total: prev.total + 1,
      correct: prev.correct + (isCorrect ? 1 : 0),
      wrong: prev.wrong + (isCorrect ? 0 : 1)
    }));
  };

  // Fisher-Yates Shuffle
  const shuffleArray = (array) => {
    const arr = [...array];
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  };

  if (questions.length === 0) {
    return (
      <div className="loader-container">
        <div className="spinner"></div>
        <p>Loading JEE Question Bank...</p>
      </div>
    );
  }

  const currentQ = filteredPool[currentQIndex];
  
  if (!currentQ) {
      return <div className="app-container"><p>No questions found for this filter.</p></div>
  }

  // Gemini returns correct_option_id natively mapping to the option.id
  const correctOptionId = currentQ.correct_option_id ? String(currentQ.correct_option_id) : null;
  // Fallback: Gemini sometimes uses 1-index for correct options if id is missing
  
  return (
    <div className="app-container">
      <header>
        <h1>JEE Endless Practice</h1>
        <p className="subtitle">{questions.length} questions loaded from the pure database</p>
      </header>

      <div className="controls-row">
        <select value={subject} onChange={(e) => setSubject(e.target.value)}>
          {subjects.map(s => (
            <option key={s} value={s}>{s === 'All' ? 'Mix All Subjects' : s}</option>
          ))}
        </select>
        
        <div className="stats">
          <div className="stat-item correct">
            <FiCheckCircle /> {score.correct}
          </div>
          <div className="stat-item wrong">
            <FiXCircle /> {score.wrong}
          </div>
          <div className="stat-item" style={{color: 'var(--text-secondary)'}}>
            <FiBookOpen /> {score.total} Attempted
          </div>
        </div>
      </div>

      <div className="glass-card">
        <div className="meta-tags">
          <span className="tag">{currentQ.exam_name} {currentQ.year}</span>
          {currentQ.subject && <span className="tag" style={{background: 'rgba(139, 92, 246, 0.1)', color: '#c4b5fd', borderColor: 'rgba(139,92,246,0.2)'}}>{currentQ.subject}</span>}
          {currentQ.chapter && <span className="tag" style={{background: 'rgba(16, 185, 129, 0.1)', color: '#6ee7b7', borderColor: 'rgba(16,185,129,0.2)'}}>{currentQ.chapter}</span>}
        </div>

        <div className="question-content">
          <MarkdownWithMath text={currentQ.question_text} />
          
          {/* Fallback rendering for diagram descriptions that Gemini transcribed */}
          {currentQ.diagram_description && (
             <div style={{ marginTop: '1rem', padding: '1rem', background: 'rgba(255,255,255,0.05)', borderRadius: '8px', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
                <strong>Diagram Reference:</strong> {currentQ.diagram_description}
             </div>
          )}
        </div>

        <div className="options-grid">
          {currentQ.options && currentQ.options.map((opt, i) => {
            // Some databases might just have strings instead of option objects 
            const isObj = typeof opt === 'object';
            const optText = isObj ? opt.text : opt;
            const optId = isObj ? String(opt.id) : String(i + 1);
            
            const isCorrect = optId === correctOptionId;
            const isSelected = selectedOption === optId;
            
            let btnClass = "option-btn";
            if (isAnswered) {
              if (isCorrect) btnClass += " correct";
              else if (isSelected) btnClass += " wrong";
            } else if (isSelected) {
              btnClass += " selected";
            }

            return (
              <button 
                key={i} 
                className={btnClass}
                disabled={isAnswered}
                onClick={() => handleOptionClick(optId, isCorrect)}
              >
                <div style={{width: '24px', height: '24px', flexShrink: 0, borderRadius: '50%', border: '1px solid var(--text-secondary)', display: 'flex', alignItems:'center', justifyContent:'center', fontSize: '0.8rem'}}>
                    {String.fromCharCode(65 + i)}
                </div>
                <div style={{flexGrow: 1}}>
                    <MarkdownWithMath text={optText} />
                </div>
                {isAnswered && isCorrect && <FiCheckCircle size={20} />}
                {isAnswered && isSelected && !isCorrect && <FiXCircle size={20} />}
              </button>
            );
          })}
        </div>

        {isAnswered && (
          <div className="solution-box">
            <h3><FiCheckCircle /> Correct Answer was {String.fromCharCode(64 + parseInt(correctOptionId || 1))}</h3>
            {currentQ.solution_text && (
              <div style={{marginTop: '0.5rem', opacity: 0.9}}>
                <MarkdownWithMath text={currentQ.solution_text} />
              </div>
            )}
            
            <div className="next-action">
              <button className="primary-btn" onClick={nextQuestion}>
                Next Question <FiArrowRight style={{verticalAlign: 'middle', marginLeft: '5px'}}/>
              </button>
            </div>
          </div>
        )}
      </div>
      
      <div style={{textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.8rem', marginTop: '2rem'}}>
        Powered by Antigravity Pipeline & Gemini API
      </div>
    </div>
  );
}

export default App;
