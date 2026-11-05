import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { saveAnalysisPayload } from './analysisPayload.js'

const repositoryPythonPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../python')

function pipelineError(message, cause) {
  const error = new Error(message)
  error.statusCode = 502
  if (cause) error.cause = cause
  return error
}

function runPythonAnalysis(inputPath, outputPath) {
  const executable = process.env.PYTHON_EXECUTABLE || 'python'
  const args = [
    '-m',
    'cartsense_analysis',
    '--input',
    inputPath,
    '--output',
    outputPath,
    '--min-support',
    process.env.ANALYSIS_MIN_SUPPORT || '0.005',
    '--min-confidence',
    process.env.ANALYSIS_MIN_CONFIDENCE || '0.1',
  ]

  return new Promise((resolve, reject) => {
    let stderr = ''
    const pythonPath = [repositoryPythonPath, process.env.PYTHONPATH].filter(Boolean).join(path.delimiter)
    const child = spawn(executable, args, {
      windowsHide: true,
      env: { ...process.env, PYTHONPATH: pythonPath },
    })
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString()
    })
    child.on('error', (error) => reject(pipelineError('Could not start the Python analysis runtime.', error)))
    child.on('close', (code) => {
      if (code !== 0) {
        const detail = stderr.trim() || `Python analysis exited with code ${code}.`
        reject(pipelineError(`Python analysis failed: ${detail}`))
        return
      }
      resolve()
    })
  })
}

export async function publishAnalysisForUpload(file) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'cartsense-analysis-'))
  const inputPath = path.join(directory, path.basename(file.originalname || 'orders.csv'))
  const outputPath = path.join(directory, 'analysis-payload.json')

  try {
    await writeFile(inputPath, file.buffer)
    await runPythonAnalysis(inputPath, outputPath)
    const payload = JSON.parse(await readFile(outputPath, 'utf8'))
    return await saveAnalysisPayload(payload)
  } catch (error) {
    if (error.statusCode) throw error
    throw pipelineError('The generated analysis payload could not be published.', error)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
}
