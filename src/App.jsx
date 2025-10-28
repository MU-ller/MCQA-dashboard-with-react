import React, { useState, useMemo } from 'react'
import * as XLSX from 'xlsx'
import { jsPDF } from 'jspdf'
import './App.css' // We'll use this for styles

function parseExcelFile(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = (e) => {
            try {
                const data = new Uint8Array(e.target.result)
                const workbook = XLSX.read(data, { type: 'array' })
                const allSheets = workbook.SheetNames.map(name => ({
                    name,
                    data: XLSX.utils.sheet_to_json(workbook.Sheets[name], { defval: '' })
                }))
                resolve(allSheets)
            } catch (err) {
                reject(err)
            }
        }
        reader.onerror = reject
        reader.readAsArrayBuffer(file)
    })
}

function normalizeRow(row) {
    const q = (row['Question'] || row['question'] || row['Questions'] || '').toString()
    const options = []
    ;['A', 'B', 'C', 'D', 'E'].forEach((letter) => {
        const key1 = `Option ${letter}`
        const key2 = `Option${letter}`
        const key3 = letter
        const value = row[key1] ?? row[key2] ?? row[key3] ?? ''
        if (value !== '') options.push({ key: letter, text: value.toString() })
    })
    const correct = (row['Correct Answer'] || row['Correct'] || row['Answer'] || '').toString().trim()
    const explanation = (row['Explanation'] || row['Notes'] || '').toString()
    const domain = (row['Domain'] || '').toString()
    const competency = (row['Competency'] || '').toString()
    return { question: q, options, correct, explanation, domain, competency }
}

export default function App() {
    const [availableSheets, setAvailableSheets] = useState([])
    const [selectedSheet, setSelectedSheet] = useState('')
    const [questionsBySheet, setQuestionsBySheet] = useState({})
    const [filterDomain, setFilterDomain] = useState('')
    const [filterCompetency, setFilterCompetency] = useState('')
    const [results, setResults] = useState({})

    async function handleFile(e) {
        const file = e.target.files[0]
        if (!file) return
        try {
            const allSheets = await parseExcelFile(file)
            setAvailableSheets(allSheets)
            const firstSheet = allSheets[0]?.name || ''
            setSelectedSheet(firstSheet)

            const newQuestionsBySheet = {}
            allSheets.forEach(s => {
                const parsed = s.data.map(normalizeRow).filter(r => r.question && r.options.length)
                newQuestionsBySheet[s.name] = parsed
            })
            setQuestionsBySheet(newQuestionsBySheet)
        } catch (err) {
            console.error(err)
            alert('Failed to parse Excel file: ' + err.message)
        }
    }

    const questions = selectedSheet ? questionsBySheet[selectedSheet] || [] : []

    const domains = useMemo(() => [...new Set(questions.map(q => q.domain).filter(Boolean))], [questions])
    const competencies = useMemo(() => [...new Set(questions.map(q => q.competency).filter(Boolean))], [questions])

    const filtered = questions.filter(q => {
        if (filterDomain && q.domain !== filterDomain) return false
        if (filterCompetency && q.competency !== filterCompetency) return false
        return true
    })

    function answerQuestion(idx, chosenKey) {
        setResults(prev => ({ ...prev, [`${selectedSheet}-${idx}`]: chosenKey }))
    }

    function checkIsCorrect(q, chosen) {
        if (!chosen) return null
        const correctLetter = q.correct.toString().trim().toUpperCase()
        if (correctLetter && ['A', 'B', 'C', 'D', 'E'].includes(correctLetter)) {
            return correctLetter === chosen
        }
        return q.options.some(o => o.text.trim() === q.correct.trim() && o.key === chosen)
    }

    function exportPDF() {
        const doc = new jsPDF()
        doc.setFontSize(16)
        doc.text('Quiz Results', 14, 20)
        let y = 30
        filtered.forEach((q, i) => {
            const chosen = results[`${selectedSheet}-${i}`]
            const correct = q.correct
            doc.setFontSize(12)
            doc.text(`${i + 1}. ${q.question}`, 14, y)
            y += 6
            doc.setFontSize(10)
            doc.text(`Your Answer: ${chosen ?? '—'}`, 14, y)
            y += 5
            doc.text(`Correct Answer: ${correct}`, 14, y)
            y += 7
            if (q.explanation) {
                doc.text(`Explanation: ${q.explanation}`, 14, y)
                y += 7
            }
            if (y > 270) {
                doc.addPage()
                y = 20
            }
        })
        doc.save('quiz-results.pdf')
    }

    const score = useMemo(() => {
        const total = filtered.length
        const correctCount = filtered.reduce((acc, q, i) => {
            const chosen = results[`${selectedSheet}-${i}`]
            if (checkIsCorrect(q, chosen)) return acc + 1
            return acc
        }, 0)
        return { total, correct: correctCount }
    }, [filtered, results, selectedSheet])

    return (
        <div className="container">
            <h1>Excel Quiz Dashboard</h1>

            <div className="uploader">
                <label className="filelabel">
                    Upload Excel (.xlsx)
                    <input type="file" accept=".xlsx,.xls" onChange={handleFile} />
                </label>
            </div>

            {availableSheets.length > 1 && (
                <div className="sheet-selector">
                    <label>Sheet: </label>
                    <select
                        value={selectedSheet}
                        onChange={e => setSelectedSheet(e.target.value)}
                    >
                        {availableSheets.map(s => (
                            <option key={s.name} value={s.name}>{s.name}</option>
                        ))}
                    </select>
                </div>
            )}

            <div className="controls">
                <div>
                    <label>Domain filter: </label>
                    <select value={filterDomain} onChange={e => setFilterDomain(e.target.value)}>
                        <option value="">(All)</option>
                        {domains.map(d => <option key={d} value={d}>{d}</option>)}
                    </select>
                </div>

                <div>
                    <label>Competency filter: </label>
                    <select value={filterCompetency} onChange={e => setFilterCompetency(e.target.value)}>
                        <option value="">(All)</option>
                        {competencies.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                </div>

                <div className="score">
                    Score: {score.correct} / {score.total}
                </div>

                <button onClick={exportPDF} disabled={filtered.length === 0}>Export Results PDF</button>
            </div>

            <div className="questions">
                {filtered.length === 0 && <p>No questions loaded. Upload an Excel file to begin.</p>}
                {filtered.map((q, idx) => {
                    const chosen = results[`${selectedSheet}-${idx}`]
                    const correctness = checkIsCorrect(q, chosen)
                    return (
                        <div key={idx} className="card">
                            <div className="q-head">{idx + 1}. {q.question}</div>
                            <div className="options">
                                {q.options.map(opt => {
                                    const isChosen = chosen === opt.key
                                    const isCorrectOption = opt.key === q.correct
                                    const showCorrectness = isChosen || (correctness === true && isCorrectOption) || (!isChosen && correctness === false && isCorrectOption)
                                    return (
                                        <button
                                            key={opt.key}
                                            className={`opt ${isChosen ? 'chosen' : ''} ${showCorrectness ? (isCorrectOption ? 'correct' : 'incorrect') : ''}`}
                                            onClick={() => answerQuestion(idx, opt.key)}
                                        >
                                            <strong>{opt.key}.</strong> {opt.text}
                                        </button>
                                    )
                                })}
                            </div>
                            <div className="meta">
                                <span>{q.domain} — {q.competency}</span>
                                {chosen && <span>{chosen} — {correctness ? 'Correct' : 'Incorrect'}</span>}
                            </div>
                            {q.explanation && <details><summary>Explanation</summary><div>{q.explanation}</div></details>}
                        </div>
                    )
                })}
            </div>

            <footer>Built with React + SheetJS • Drop an Excel with columns: Question, Option A..E, Correct Answer, Explanation, Domain, Competency</footer>
        </div>
    )
}
