import { useEffect, useMemo, useState } from 'react'
import Papa from 'papaparse'
import './App.css'

const POLLING_SHEET_URL =
  import.meta.env.VITE_POLLING_SHEET_URL ||
  'https://docs.google.com/spreadsheets/d/1n7vfhCZ1P3iwnNVgroe7uAhvMDWeyhroSAJm8yvsiEw/edit?gid=1991549020'

const FAMILY_SHEET_URL =
  import.meta.env.VITE_FAMILY_SHEET_URL ||
  'https://docs.google.com/spreadsheets/d/1xBtaKtNwgmMRVc-jYifmHz9NcR1NUG3bqOmX-wvmN-E/edit?gid=1472803024'

const ONDRIYUM_SHEET_URL =
  import.meta.env.VITE_ONDRIYUM_SHEET_URL ||
  'https://docs.google.com/spreadsheets/d/1DGVV21cn3P3i22t_nqd-jxAFalO5wGa69hBLPDyHWHE/edit?usp=sharing'

const BOOTH_MIN = 1
const BOOTH_MAX = 327

const normalizeHeader = (value) => value.toString().trim().toLowerCase()

const hasLetters = (value) => /[a-zA-Z]/.test(value.toString())

const toNumber = (value) => {
  if (value === null || value === undefined) return null
  const raw = value.toString().trim()
  if (!raw) return null
  if (hasLetters(raw)) return null
  const cleaned = raw.replace(/[, ]/g, '')
  if (cleaned === '') return null
  const num = Number(cleaned)
  return Number.isFinite(num) ? num : null
}

const parseBoothNumber = (value) => {
  if (value === null || value === undefined) return null
  const booth = value.toString().trim()
  if (!booth) return null
  if (hasLetters(booth)) return null
  const num = Number(booth)
  if (!Number.isFinite(num)) return null
  return num
}

const isValidBooth = (value) => {
  if (value === null || value === undefined) return false
  const booth = value.toString().trim()
  if (!booth) return false
  if (hasLetters(booth)) return false
  const num = parseBoothNumber(booth)
  if (num === null) return false
  return num >= BOOTH_MIN && num <= BOOTH_MAX
}

const toDateKey = (value) => {
  if (!value) return ''
  const asDate = new Date(value)
  if (Number.isNaN(asDate.getTime())) return value.toString().trim()
  const year = asDate.getFullYear()
  const month = String(asDate.getMonth() + 1).padStart(2, '0')
  const day = String(asDate.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

const toTimestamp = (value) => {
  if (!value) return 0
  const asDate = new Date(value)
  if (!Number.isNaN(asDate.getTime())) return asDate.getTime()
  return 0
}

const formatNumber = (value) =>
  value === null || value === undefined
    ? '-'
    : new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(value)

const formatPercent = (value) =>
  Number.isFinite(value) ? `${value.toFixed(1)}%` : '-'

const toCsvUrl = (url) => {
  if (!url) return ''
  if (url.includes('tqx=out:csv')) return url
  if (url.includes('/export?format=csv')) return url
  const match = url.match(/spreadsheets\/d\/([a-zA-Z0-9-_]+)/)
  if (!match) return url
  const sheetId = match[1]
  const gidMatch = url.match(/gid=(\d+)/)
  const gid = gidMatch ? gidMatch[1] : ''
  if (gid) {
    return `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv&gid=${gid}`
  }
  return `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv`
}

const parsePollingRows = (data) => {
  const [headerRow, ...rows] = data
  const headers = headerRow.map(normalizeHeader)

  const idxDate = 0
  const idxBooth = 2
  const idxTotalVotes = 3
  const idxFavVotes = 4

  if (headers.length < 5) return { valid: [], invalid: [] }

  const latestByBooth = new Map()
  const invalid = []

  rows.forEach((row, index) => {
    if (!row || row.length < 5) return
    const dateValue = row[idxDate]
    const boothValue = row[idxBooth]
    const totalVotesValue = row[idxTotalVotes]
    const favVotesValue = row[idxFavVotes]

    if (!isValidBooth(boothValue)) {
      const boothNum = parseBoothNumber(boothValue)
      invalid.push({
        date: toDateKey(dateValue),
        booth: boothValue?.toString().trim() ?? '-',
        totalVotes: totalVotesValue?.toString().trim() ?? '-',
        favourableVotes: favVotesValue?.toString().trim() ?? '-',
        reason:
          boothNum === null
            ? 'Booth is not numeric'
            : `Booth out of range (${BOOTH_MIN}-${BOOTH_MAX})`,
      })
      return
    }
    const booth = boothValue.toString().trim()

    const totalVotes = toNumber(totalVotesValue)
    const favourableVotes = toNumber(favVotesValue)

    if (totalVotes === null || favourableVotes === null) {
      invalid.push({
        date: toDateKey(dateValue),
        booth,
        totalVotes: totalVotesValue?.toString().trim() ?? '-',
        favourableVotes: favVotesValue?.toString().trim() ?? '-',
        reason: 'Votes must be numeric',
      })
      return
    }
    if (totalVotes < favourableVotes) {
      invalid.push({
        date: toDateKey(dateValue),
        booth,
        totalVotes,
        favourableVotes,
        reason: 'Total votes < favourable votes',
      })
      return
    }

    const timestamp = toTimestamp(dateValue)

    const candidate = {
      date: toDateKey(dateValue),
      booth,
      totalVotes,
      favourableVotes,
      favourablePercent: totalVotes ? (favourableVotes / totalVotes) * 100 : 0,
      timestamp,
      rowIndex: index,
    }

    const existing = latestByBooth.get(booth)
    if (!existing) {
      latestByBooth.set(booth, candidate)
      return
    }

    if (
      candidate.timestamp > existing.timestamp ||
      (candidate.timestamp === existing.timestamp &&
        candidate.rowIndex > existing.rowIndex)
    ) {
      latestByBooth.set(booth, candidate)
    }
  })

  return { valid: Array.from(latestByBooth.values()), invalid }
}

const parseFamilyRows = (data) => {
  const [headerRow, ...rows] = data
  const headers = headerRow.map(normalizeHeader)

  const idxDate = 2
  const idxBooth = 3
  const idxFamilies = 4

  if (headers.length < 5) return { valid: [], invalid: [] }

  const latestByBooth = new Map()
  const invalid = []

  rows.forEach((row, index) => {
    if (!row || row.length < 5) return
    const dateValue = row[idxDate]
    const boothValue = row[idxBooth]
    const familiesValue = row[idxFamilies]

    if (!isValidBooth(boothValue)) {
      const boothNum = parseBoothNumber(boothValue)
      invalid.push({
        date: toDateKey(dateValue),
        booth: boothValue?.toString().trim() ?? '-',
        families: familiesValue?.toString().trim() ?? '-',
        reason:
          boothNum === null
            ? 'Booth is not numeric'
            : `Booth out of range (${BOOTH_MIN}-${BOOTH_MAX})`,
      })
      return
    }
    const booth = boothValue.toString().trim()

    const families = toNumber(familiesValue)
    if (families === null) {
      invalid.push({
        date: toDateKey(dateValue),
        booth,
        families: familiesValue?.toString().trim() ?? '-',
        reason: 'Families must be numeric',
      })
      return
    }

    const timestamp = toTimestamp(dateValue)

    const candidate = {
      date: toDateKey(dateValue),
      booth,
      families,
      timestamp,
      rowIndex: index,
    }

    const existing = latestByBooth.get(booth)
    if (!existing) {
      latestByBooth.set(booth, candidate)
      return
    }

    if (
      candidate.timestamp > existing.timestamp ||
      (candidate.timestamp === existing.timestamp &&
        candidate.rowIndex > existing.rowIndex)
    ) {
      latestByBooth.set(booth, candidate)
    }
  })

  return { valid: Array.from(latestByBooth.values()), invalid }
}

const parseOndriyumRows = (data) => {
  const [headerRow, ...rows] = data
  const headers = headerRow.map(normalizeHeader)

  if (headers.length < 6) return { valid: [], invalid: [] }

  const idxBooth = 0
  const idxPlace = 1
  const idxMale = 2
  const idxFemale = 3
  const idxThird = 4
  const idxTotalVotes = 5
  const idxOndriyum = 6
  const idxExact = 7

  const latestByBooth = new Map()
  const invalid = []

  rows.forEach((row, index) => {
    if (!row || row.length < 6) return
    const boothValue = row[idxBooth]
    const placeValue = row[idxPlace]
    const maleValue = row[idxMale]
    const femaleValue = row[idxFemale]
    const thirdValue = row[idxThird]
    const totalVotesValue = row[idxTotalVotes]
    const ondriyumValue = row[idxOndriyum]
    const exactPlaceValue = row[idxExact]

    if (!isValidBooth(boothValue)) {
      const boothNum = parseBoothNumber(boothValue)
      invalid.push({
        booth: boothValue?.toString().trim() ?? '-',
        ondriyum: ondriyumValue?.toString().trim() ?? '-',
        reason:
          boothNum === null
            ? 'Booth is not numeric'
            : `Booth out of range (${BOOTH_MIN}-${BOOTH_MAX})`,
      })
      return
    }
    const booth = boothValue.toString().trim()

    const male = toNumber(maleValue)
    const female = toNumber(femaleValue)
    let thirdGender = toNumber(thirdValue)
    const totalVotes = toNumber(totalVotesValue)
    const ondriyumName = ondriyumValue?.toString().trim() ?? ''
    const thirdRaw = thirdValue?.toString().trim() ?? ''

    if (thirdGender === null && thirdRaw === '') {
      thirdGender = 0
    }

    if (
      male === null ||
      female === null ||
      thirdGender === null ||
      totalVotes === null
    ) {
      invalid.push({
        booth,
        ondriyum: ondriyumName || '-',
        reason: 'Male/Female/Third/Total must be numeric',
      })
      return
    }

    const candidate = {
      booth,
      place: placeValue?.toString().trim() ?? '',
      ondriyum: ondriyumName,
      exactPlace: exactPlaceValue?.toString().trim() ?? '',
      male,
      female,
      thirdGender,
      totalVotes,
      rowIndex: index,
    }

    const existing = latestByBooth.get(booth)
    if (!existing) {
      latestByBooth.set(booth, candidate)
      return
    }

    if (candidate.rowIndex > existing.rowIndex) {
      latestByBooth.set(booth, candidate)
    }
  })

  return { valid: Array.from(latestByBooth.values()), invalid }
}

const clampPercent = (value, fallback) => {
  const num = Number(value)
  if (!Number.isFinite(num)) return fallback
  return Math.min(100, Math.max(0, num))
}

const clampBooth = (value, fallback) => {
  const num = Number(value)
  if (!Number.isFinite(num)) return fallback
  return Math.min(BOOTH_MAX, Math.max(BOOTH_MIN, num))
}

const RANGE_PRESETS = [
  { label: '0-25%', min: 0, max: 25 },
  { label: '25-50%', min: 25, max: 50 },
  { label: '50-75%', min: 50, max: 75 },
  { label: '75-100%', min: 75, max: 100 },
]

export default function App() {
  const [familyRows, setFamilyRows] = useState([])
  const [familyInvalid, setFamilyInvalid] = useState([])
  const [pollingRows, setPollingRows] = useState([])
  const [pollingInvalid, setPollingInvalid] = useState([])
  const [ondriyumRows, setOndriyumRows] = useState([])
  const [ondriyumInvalid, setOndriyumInvalid] = useState([])
  const [status, setStatus] = useState('idle')
  const [error, setError] = useState('')
  const [filterDate, setFilterDate] = useState('')
  const [filterBooth, setFilterBooth] = useState('')
  const [searchBooth, setSearchBooth] = useState('')
  const [percentMin, setPercentMin] = useState(0)
  const [percentMax, setPercentMax] = useState(100)
  const [ondriyumFilter, setOndriyumFilter] = useState('')
  const [ondriyumMinBooth, setOndriyumMinBooth] = useState(BOOTH_MIN)
  const [ondriyumMaxBooth, setOndriyumMaxBooth] = useState(BOOTH_MAX)
  const [activeTab, setActiveTab] = useState('family')

  useEffect(() => {
    const pollingUrl = toCsvUrl(POLLING_SHEET_URL)
    const familyUrl = toCsvUrl(FAMILY_SHEET_URL)
    const ondriyumUrl = toCsvUrl(ONDRIYUM_SHEET_URL)

    if (!pollingUrl || !familyUrl || !ondriyumUrl) {
      setFamilyRows([])
      setPollingRows([])
      setOndriyumRows([])
      setFamilyInvalid([])
      setPollingInvalid([])
      setOndriyumInvalid([])
      setStatus('error')
      setError('Google Sheets URLs are missing.')
      return
    }

    setStatus('loading')
    setError('')

    const fetchCsv = (url) =>
      fetch(url, { cache: 'no-store' })
        .then((res) => {
          if (!res.ok) throw new Error(`Request failed with ${res.status}`)
          return res.text()
        })
        .then((csvText) => {
          const parsed = Papa.parse(csvText, { skipEmptyLines: true })
          if (!parsed.data || parsed.data.length === 0) {
            throw new Error('No data found in the sheet.')
          }
          return parsed.data
        })

    Promise.all([fetchCsv(pollingUrl), fetchCsv(familyUrl), fetchCsv(ondriyumUrl)])
      .then(([pollingData, familyData, ondriyumData]) => {
        const polling = parsePollingRows(pollingData)
        const families = parseFamilyRows(familyData)
        const ondriyum = parseOndriyumRows(ondriyumData)

        setPollingRows(polling.valid)
        setPollingInvalid(polling.invalid)
        setFamilyRows(families.valid)
        setFamilyInvalid(families.invalid)
        setOndriyumRows(ondriyum.valid)
        setOndriyumInvalid(ondriyum.invalid)
        setStatus('ready')
      })
      .catch((err) => {
        setPollingRows([])
        setPollingInvalid([])
        setFamilyRows([])
        setFamilyInvalid([])
        setOndriyumRows([])
        setOndriyumInvalid([])
        setStatus('error')
        setError(err.message || 'Unable to load the sheet data.')
      })
  }, [])

  const ondriyumOptions = useMemo(() => {
    const set = new Set(
      ondriyumRows
        .map((row) => row.ondriyum)
        .filter((value) => value !== ''),
    )
    return Array.from(set).sort((a, b) => a.localeCompare(b))
  }, [ondriyumRows])

  const allowedBooths = useMemo(() => {
    if (ondriyumFilter) {
      return new Set(
        ondriyumRows
          .filter((row) => row.ondriyum === ondriyumFilter)
          .map((row) => row.booth),
      )
    }
    const minValue = clampBooth(ondriyumMinBooth, BOOTH_MIN)
    const maxValue = clampBooth(ondriyumMaxBooth, BOOTH_MAX)
    const min = Math.min(minValue, maxValue)
    const max = Math.max(minValue, maxValue)
    const set = new Set()
    for (let i = min; i <= max; i += 1) {
      set.add(String(i))
    }
    return set
  }, [ondriyumRows, ondriyumFilter, ondriyumMinBooth, ondriyumMaxBooth])

  const filteredFamilies = useMemo(() => {
    const dateFilter = filterDate.trim()
    const boothFilter = filterBooth.trim().toLowerCase()

    return familyRows.filter((row) => {
      if (!allowedBooths.has(row.booth)) return false
      const matchesDate = !dateFilter || row.date === dateFilter
      const matchesBooth =
        !boothFilter || row.booth.toLowerCase().includes(boothFilter)
      return matchesDate && matchesBooth
    })
  }, [familyRows, filterDate, filterBooth, allowedBooths])

  const filteredPolling = useMemo(() => {
    const boothFilter = searchBooth.trim().toLowerCase()
    const minValue = clampPercent(percentMin, 0)
    const maxValue = clampPercent(percentMax, 100)
    const min = Math.min(minValue, maxValue)
    const max = Math.max(minValue, maxValue)

    return pollingRows
      .filter((row) => allowedBooths.has(row.booth))
      .filter((row) =>
        boothFilter ? row.booth.toLowerCase().includes(boothFilter) : true,
      )
      .filter(
        (row) =>
          row.favourablePercent >= min && row.favourablePercent <= max,
      )
      .sort((a, b) => a.booth.localeCompare(b.booth))
  }, [pollingRows, searchBooth, percentMin, percentMax, allowedBooths])

  const filteredOndriyum = useMemo(() => {
    return ondriyumRows
      .filter((row) => allowedBooths.has(row.booth))
      .sort((a, b) => Number(a.booth) - Number(b.booth))
  }, [ondriyumRows, allowedBooths])

  const combinedOndriyum = useMemo(() => {
    const pollingMap = new Map(pollingRows.map((row) => [row.booth, row]))
    const combined = filteredOndriyum.map((row) => {
      const poll = pollingMap.get(row.booth)
      return {
        ...row,
        totalVotes: row.totalVotes,
        polledVotes: poll?.totalVotes ?? null,
        favourableVotes: poll?.favourableVotes ?? null,
        favourablePercent: poll?.favourablePercent ?? null,
      }
    })
    return combined.filter((row) => {
      const minValue = clampPercent(percentMin, 0)
      const maxValue = clampPercent(percentMax, 100)
      const min = Math.min(minValue, maxValue)
      const max = Math.max(minValue, maxValue)
      if (!Number.isFinite(row.favourablePercent)) return false
      return row.favourablePercent >= min && row.favourablePercent <= max
    })
  }, [filteredOndriyum, pollingRows, percentMin, percentMax])

  const familiesTotal = useMemo(
    () => filteredFamilies.reduce((sum, row) => sum + (row.families || 0), 0),
    [filteredFamilies],
  )

  const totalVotesOndriyum = useMemo(
    () => ondriyumRows.reduce((sum, row) => sum + (row.totalVotes || 0), 0),
    [ondriyumRows],
  )

  const polledVotesTotal = useMemo(
    () => pollingRows.reduce((sum, row) => sum + (row.totalVotes || 0), 0),
    [pollingRows],
  )

  const favourableVotesTotal = useMemo(
    () =>
      pollingRows.reduce((sum, row) => sum + (row.favourableVotes || 0), 0),
    [pollingRows],
  )

  const favourableShare = polledVotesTotal
    ? (favourableVotesTotal / polledVotesTotal) * 100
    : null

  const familyInsightTotal = useMemo(
    () => filteredFamilies.reduce((sum, row) => sum + (row.families || 0), 0),
    [filteredFamilies],
  )

  const pollingInsightTotals = useMemo(() => {
    const total = filteredPolling.reduce((sum, row) => sum + (row.totalVotes || 0), 0)
    const fav = filteredPolling.reduce((sum, row) => sum + (row.favourableVotes || 0), 0)
    return {
      total,
      fav,
      share: total ? (fav / total) * 100 : null,
    }
  }, [filteredPolling])

  const ondriyumInsightTotals = useMemo(() => {
    const totalVotes = combinedOndriyum.reduce(
      (sum, row) => sum + (row.totalVotes || 0),
      0,
    )
    const polledVotes = combinedOndriyum.reduce(
      (sum, row) => sum + (row.polledVotes || 0),
      0,
    )
    const favourableVotes = combinedOndriyum.reduce(
      (sum, row) => sum + (row.favourableVotes || 0),
      0,
    )
    return { totalVotes, polledVotes, favourableVotes }
  }, [combinedOndriyum])

  const ondriyumSummary = useMemo(() => {
    const pollingMap = new Map(pollingRows.map((row) => [row.booth, row]))
    const map = new Map()
    ondriyumRows.forEach((row) => {
      const key = row.ondriyum || 'Unknown'
      const poll = pollingMap.get(row.booth)
      const existing = map.get(key) || {
        ondriyum: key,
        totalVotes: 0,
        polledVotes: 0,
        favourableVotes: 0,
      }
      existing.totalVotes += row.totalVotes || 0
      existing.polledVotes += poll?.totalVotes || 0
      existing.favourableVotes += poll?.favourableVotes || 0
      map.set(key, existing)
    })
    return Array.from(map.values())
      .map((row) => ({
        ...row,
        favourablePercent: row.polledVotes
          ? (row.favourableVotes / row.polledVotes) * 100
          : null,
      }))
      .sort((a, b) => a.ondriyum.localeCompare(b.ondriyum))
  }, [ondriyumRows, pollingRows])

  const familyOndriyumSummary = useMemo(() => {
    const ondriyumMap = new Map(ondriyumRows.map((row) => [row.booth, row]))
    const map = new Map()
    filteredFamilies.forEach((row) => {
      const ondriyum = ondriyumMap.get(row.booth)?.ondriyum || 'Unknown'
      const existing = map.get(ondriyum) || {
        ondriyum,
        families: 0,
      }
      existing.families += row.families || 0
      map.set(ondriyum, existing)
    })
    return Array.from(map.values()).sort((a, b) =>
      a.ondriyum.localeCompare(b.ondriyum),
    )
  }, [filteredFamilies, ondriyumRows])

  const insightData = useMemo(() => {
    if (!filterDate) return []
    const byBooth = filteredFamilies
      .map((row) => ({ booth: row.booth, value: row.families }))
      .sort((a, b) => b.value - a.value)
    return byBooth
  }, [filterDate, filteredFamilies])

  const maxInsightValue = useMemo(() => {
    if (!insightData.length) return 0
    return Math.max(...insightData.map((item) => item.value))
  }, [insightData])

  const rangeCounts = useMemo(() => {
    return RANGE_PRESETS.map((range) => ({
      ...range,
      count: pollingRows.filter(
        (row) =>
          row.favourablePercent >= range.min &&
          row.favourablePercent < range.max + 0.0001,
      ).length,
    }))
  }, [pollingRows])

  const missingFamilyBooths = useMemo(() => {
    const existing = new Set(
      familyRows
        .filter((row) => allowedBooths.has(row.booth))
        .map((row) => Number(row.booth)),
    )
    const missing = []
    for (let i = BOOTH_MIN; i <= BOOTH_MAX; i += 1) {
      if (allowedBooths.has(String(i)) && !existing.has(i)) missing.push(i)
    }
    return missing
  }, [familyRows, allowedBooths])

  const missingPollingBooths = useMemo(() => {
    const existing = new Set(
      pollingRows
        .filter((row) => allowedBooths.has(row.booth))
        .map((row) => Number(row.booth)),
    )
    const missing = []
    for (let i = BOOTH_MIN; i <= BOOTH_MAX; i += 1) {
      if (allowedBooths.has(String(i)) && !existing.has(i)) missing.push(i)
    }
    return missing
  }, [pollingRows, allowedBooths])

  const missingOndriyumBooths = useMemo(() => {
    const existing = new Set(
      ondriyumRows
        .filter((row) => allowedBooths.has(row.booth))
        .map((row) => Number(row.booth)),
    )
    const missing = []
    for (let i = BOOTH_MIN; i <= BOOTH_MAX; i += 1) {
      if (allowedBooths.has(String(i)) && !existing.has(i)) missing.push(i)
    }
    return missing
  }, [ondriyumRows, allowedBooths])

  const favouriteMap = useMemo(() => {
    const map = new Map()
    pollingRows.forEach((row) => {
      map.set(row.booth, row.favourablePercent)
    })
    return map
  }, [pollingRows])

  const boothColor = (booth) => {
    const pct = favouriteMap.get(String(booth))
    if (!Number.isFinite(pct)) return '#cbd5f5'
    const clamped = Math.min(100, Math.max(0, pct))
    const hue = (clamped / 100) * 120
    return `hsl(${hue}, 70%, 45%)`
  }

  return (
    <div className="app">
      <header className="hero">
        <div>
          <p className="eyebrow">Election War Room</p>
          <h1>Booth Monitoring & Vote Intelligence</h1>
          <p className="subheading">
            Live dashboard connected to Google Forms data. Track families, booth
            activity, and favourable voting signals in one place.
          </p>
        </div>
        <div className="status-card">
          <span className={`status-dot ${status}`} />
          <div>
            <p className="status-label">Data Feed</p>
            <p className="status-value">
              {status === 'loading'
                ? 'Syncing...'
                : status === 'error'
                  ? 'Check Sheets access'
                  : 'Live'}
            </p>
            {error && <p className="status-error">{error}</p>}
          </div>
        </div>
      </header>

      <section className="cards">
        <div className="card">
          <p className="card-label">Families Recorded</p>
          <h2>{formatNumber(familiesTotal)}</h2>
          <p className="card-meta">Filtered by date and booth</p>
        </div>
        <div className="card">
          <p className="card-label">Total Votes (Ondriyum)</p>
          <h2>{formatNumber(totalVotesOndriyum)}</h2>
          <p className="card-meta">From Ondriyum sheet</p>
        </div>
        <div className="card">
          <p className="card-label">Polled Votes So Far</p>
          <h2>{formatNumber(polledVotesTotal)}</h2>
          <p className="card-meta">From polling sheet</p>
        </div>
        <div className="card">
          <p className="card-label">Favourable Votes</p>
          <h2>{formatNumber(favourableVotesTotal)}</h2>
          <p className="card-meta">From polling sheet</p>
        </div>
        <div className="card highlight">
          <p className="card-label">Favourable Share</p>
          <h2>{formatPercent(favourableShare)}</h2>
          <p className="card-meta">Current filter view</p>
        </div>
      </section>

      <section className="switcher">
        <button
          className={activeTab === 'family' ? 'active' : ''}
          onClick={() => setActiveTab('family')}
          type="button"
        >
          Family Canvas
        </button>
        <button
          className={activeTab === 'polling' ? 'active' : ''}
          onClick={() => setActiveTab('polling')}
          type="button"
        >
          Polling Status
        </button>
        <button
          className={activeTab === 'ondriyum' ? 'active' : ''}
          onClick={() => setActiveTab('ondriyum')}
          type="button"
        >
          Ondriyum Wise
        </button>
      </section>

      <section className="dashboard filters-panel">
        <div className="dashboard-header">
          <div>
            <h3>Common Filters</h3>
            <p>Apply Ondriyum or booth range filters across all tabs.</p>
          </div>
          <div className="filters">
            <label>
              Ondriyum
              <select
                value={ondriyumFilter}
                onChange={(e) => setOndriyumFilter(e.target.value)}
              >
                <option value="">All Ondriyum</option>
                {ondriyumOptions.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Booth From
              <input
                type="number"
                min={BOOTH_MIN}
                max={BOOTH_MAX}
                value={ondriyumMinBooth}
                onChange={(e) => setOndriyumMinBooth(e.target.value)}
                disabled={Boolean(ondriyumFilter)}
              />
            </label>
            <label>
              Booth To
              <input
                type="number"
                min={BOOTH_MIN}
                max={BOOTH_MAX}
                value={ondriyumMaxBooth}
                onChange={(e) => setOndriyumMaxBooth(e.target.value)}
                disabled={Boolean(ondriyumFilter)}
              />
            </label>
          </div>
        </div>
      </section>

      {activeTab === 'family' && (
        <section className="dashboard">
          <div className="dashboard-header">
            <div>
              <h3>Family Canvas Dashboard</h3>
              <p>Latest entry per booth. Filters by date and booth.</p>
            </div>
            <div className="filters">
              <label>
                Date
                <input
                  type="date"
                  value={filterDate}
                  onChange={(e) => setFilterDate(e.target.value)}
                />
              </label>
              <label>
                Booth Search
                <input
                  type="search"
                  placeholder="Search booth"
                  value={filterBooth}
                  onChange={(e) => setFilterBooth(e.target.value)}
                />
              </label>
            </div>
          </div>

          <div className="insight">
            <div>
              <h4>Family Canvas Insights</h4>
              <p>
                {filterDate
                  ? `Top booths by families met on ${filterDate}.`
                  : 'Select a date to see booth-wise insights.'}
              </p>
            </div>
            <div className="insight-chart">
            {filterDate && insightData.length ? (
              insightData.map((item) => (
                <div className="insight-row" key={item.booth}>
                  <span>{item.booth}</span>
                  <div className="insight-bar">
                    <div
                      style={{
                        width: `${(item.value / maxInsightValue) * 100}%`,
                      }}
                    />
                  </div>
                  <span>{formatNumber(item.value)}</span>
                </div>
              ))
            ) : (
              <div className="empty">No insight data yet.</div>
            )}
          </div>
        </div>

        <div className="split">
          <div>
            <h4>Valid Family Records</h4>
            <div className="table">
              <div className="table-row table-head">
                <span>Date</span>
                <span>Booth No</span>
                <span>Families Met</span>
              </div>
              {filteredFamilies.map((row, idx) => (
                <div
                  className="table-row"
                  key={`${row.booth}-${row.date}-${idx}`}
                >
                  <span>{row.date || '-'}</span>
                  <span>{row.booth || '-'}</span>
                  <span>{formatNumber(row.families)}</span>
                </div>
              ))}
              {!filteredFamilies.length && (
                <div className="empty">No matching family records.</div>
              )}
            </div>
          </div>

          <section className="cards mini stack">
            <div className="card">
              <p className="card-label">Families Met</p>
              <h2>{formatNumber(familyInsightTotal)}</h2>
              <p className="card-meta">Within current filters</p>
            </div>
            <div className="card">
              <p className="card-label">Booths Covered</p>
              <h2>{formatNumber(filteredFamilies.length)}</h2>
              <p className="card-meta">Valid booths in scope</p>
            </div>
            <div className="card">
              <p className="card-label">Missing Booths</p>
              <h2>{formatNumber(missingFamilyBooths.length)}</h2>
              <p className="card-meta">Within current filters</p>
            </div>
          </section>

          <div className="summary">
            <h4>Ondriyum Wise Family Totals</h4>
            <div className="table">
              <div className="table-row table-head">
                <span>Ondriyum</span>
                <span>Families Met</span>
              </div>
              {familyOndriyumSummary.map((row) => (
                <div className="table-row" key={`fam-ond-${row.ondriyum}`}>
                  <span>{row.ondriyum}</span>
                  <span>{formatNumber(row.families)}</span>
                </div>
              ))}
              {!familyOndriyumSummary.length && (
                <div className="empty">No ondriyum family totals yet.</div>
              )}
            </div>
          </div>
          <div>
            <h4>Rejected Family Records ({familyInvalid.length})</h4>
            <div className="table">
              <div className="table-row table-head">
                <span>Date</span>
                <span>Booth No</span>
                <span>Families</span>
                <span>Reason</span>
              </div>
              {familyInvalid.map((row, idx) => (
                <div className="table-row" key={`fam-invalid-${idx}`}>
                  <span>{row.date || '-'}</span>
                  <span>{row.booth || '-'}</span>
                  <span>{row.families}</span>
                  <span>{row.reason}</span>
                </div>
              ))}
              {!familyInvalid.length && (
                <div className="empty">No rejected family records.</div>
              )}
            </div>
          </div>
        </div>

          <div className="missing">
            <h4>Booths Missing Family Data ({missingFamilyBooths.length})</h4>
            <div className="chip-list">
              {missingFamilyBooths.length ? (
                missingFamilyBooths.map((booth) => (
                  <span
                    className="chip"
                    key={`fam-miss-${booth}`}
                    style={{ background: boothColor(booth) }}
                  >
                    {booth}
                  </span>
                ))
              ) : (
                <div className="empty">All booths have family data.</div>
              )}
            </div>
          </div>
        </section>
      )}

      {activeTab === 'polling' && (
        <section className="dashboard vote">
          <div className="dashboard-header">
            <div>
              <h3>Polling Status Dashboard</h3>
              <p>
                Latest polling entry per booth. Filter by favourable vote % and
                booth.
              </p>
            </div>
            <div className="filters">
              <label>
                Booth Search
                <input
                  type="search"
                  placeholder="Search booth"
                  value={searchBooth}
                  onChange={(e) => setSearchBooth(e.target.value)}
                />
              </label>
              <label>
                % Min
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={percentMin}
                  onChange={(e) => setPercentMin(e.target.value)}
                />
              </label>
              <label>
                % Max
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={percentMax}
                  onChange={(e) => setPercentMax(e.target.value)}
                />
              </label>
            </div>
          </div>

          <div className="range-chips">
            {rangeCounts.map((range) => (
              <button
              key={range.label}
              type="button"
              onClick={() => {
                setPercentMin(range.min)
                setPercentMax(range.max)
              }}
            >
              {range.label} ({range.count})
              </button>
            ))}
          </div>

          <section className="cards mini">
            <div className="card">
              <p className="card-label">Polled Votes</p>
              <h2>{formatNumber(pollingInsightTotals.total)}</h2>
              <p className="card-meta">Within current filters</p>
            </div>
            <div className="card">
              <p className="card-label">Favourable Votes</p>
              <h2>{formatNumber(pollingInsightTotals.fav)}</h2>
              <p className="card-meta">Within current filters</p>
            </div>
            <div className="card highlight">
              <p className="card-label">Favourable Share</p>
              <h2>{formatPercent(pollingInsightTotals.share)}</h2>
              <p className="card-meta">Current filter view</p>
            </div>
          </section>

          <div className="summary">
            <h4>Ondriyum Wise Overall Totals</h4>
            <div className="table">
              <div className="table-row table-head">
                <span>Ondriyum</span>
                <span>Total Votes</span>
                <span>Polled Votes</span>
                <span>Favourable Votes</span>
                <span>Favourable %</span>
              </div>
              {ondriyumSummary.map((row) => (
                <div className="table-row" key={`ond-sum-${row.ondriyum}`}>
                  <span>{row.ondriyum}</span>
                  <span>{formatNumber(row.totalVotes)}</span>
                  <span>{formatNumber(row.polledVotes)}</span>
                  <span>{formatNumber(row.favourableVotes)}</span>
                  <span>{formatPercent(row.favourablePercent)}</span>
                </div>
              ))}
              {!ondriyumSummary.length && (
                <div className="empty">No ondriyum totals yet.</div>
              )}
            </div>
          </div>

        <div className="split">
          <div>
            <h4>Valid Polling Records</h4>
            <div className="table">
              <div className="table-row table-head">
                <span>Booth No</span>
                <span>Total Votes</span>
                <span>Favourable Votes</span>
                <span>Favourable %</span>
              </div>
              {filteredPolling.map((row) => (
                <div className="table-row" key={row.booth}>
                  <span style={{ color: boothColor(row.booth) }}>
                    {row.booth}
                  </span>
                  <span>{formatNumber(row.totalVotes)}</span>
                  <span>{formatNumber(row.favourableVotes)}</span>
                  <span>{formatPercent(row.favourablePercent)}</span>
                </div>
              ))}
              {!filteredPolling.length && (
                <div className="empty">No booth totals yet.</div>
              )}
            </div>
          </div>
          <div>
            <h4>Rejected Polling Records ({pollingInvalid.length})</h4>
            <div className="table">
              <div className="table-row table-head">
                <span>Date</span>
                <span>Booth No</span>
                <span>Total</span>
                <span>Fav</span>
                <span>Reason</span>
              </div>
              {pollingInvalid.map((row, idx) => (
                <div className="table-row" key={`poll-invalid-${idx}`}>
                  <span>{row.date || '-'}</span>
                  <span>{row.booth || '-'}</span>
                  <span>{row.totalVotes}</span>
                  <span>{row.favourableVotes}</span>
                  <span>{row.reason}</span>
                </div>
              ))}
              {!pollingInvalid.length && (
                <div className="empty">No rejected polling records.</div>
              )}
            </div>
          </div>
        </div>

          <div className="missing">
            <h4>Booths Missing Polling Data ({missingPollingBooths.length})</h4>
            <div className="chip-list">
              {missingPollingBooths.length ? (
                missingPollingBooths.map((booth) => (
                  <span
                    className="chip"
                    key={`poll-miss-${booth}`}
                    style={{ background: boothColor(booth) }}
                  >
                    {booth}
                  </span>
                ))
              ) : (
                <div className="empty">All booths have polling data.</div>
              )}
            </div>
          </div>
        </section>
      )}

      {activeTab === 'ondriyum' && (
        <section className="dashboard ondriyum">
          <div className="dashboard-header">
            <div>
              <h3>Ondriyum Wise Dashboard</h3>
              <p>
                Filter by Ondriyum or booth range to see booth-wise vote data.
              </p>
            </div>
            <div className="filters">
              <label>
                % Min
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={percentMin}
                  onChange={(e) => setPercentMin(e.target.value)}
                />
              </label>
              <label>
                % Max
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={percentMax}
                  onChange={(e) => setPercentMax(e.target.value)}
                />
              </label>
            </div>
          </div>

          <section className="cards mini">
            <div className="card">
              <p className="card-label">Total Votes</p>
              <h2>{formatNumber(ondriyumInsightTotals.totalVotes)}</h2>
              <p className="card-meta">Within current filters</p>
            </div>
            <div className="card">
              <p className="card-label">Polled Votes</p>
              <h2>{formatNumber(ondriyumInsightTotals.polledVotes)}</h2>
              <p className="card-meta">Within current filters</p>
            </div>
            <div className="card">
              <p className="card-label">Favourable Votes</p>
              <h2>{formatNumber(ondriyumInsightTotals.favourableVotes)}</h2>
              <p className="card-meta">Within current filters</p>
            </div>
          </section>

          <div className="split">
            <div>
              <h4>Ondriyum Booths (Polling + Ondriyum)</h4>
            <div className="table">
              <div className="table-row table-head">
                <span>Booth</span>
                <span>Ondriyum</span>
                <span>Total Votes</span>
                <span>Polled Votes</span>
                <span>Favourable</span>
                <span>Fav %</span>
              </div>
              {combinedOndriyum.map((row) => (
                <div className="table-row" key={`ond-${row.booth}`}>
                  <span style={{ color: boothColor(row.booth) }}>
                    {row.booth}
                  </span>
                  <span>{row.ondriyum || '-'}</span>
                  <span>{formatNumber(row.totalVotes)}</span>
                  <span>{formatNumber(row.polledVotes)}</span>
                  <span>{formatNumber(row.favourableVotes)}</span>
                  <span>{formatPercent(row.favourablePercent)}</span>
                </div>
              ))}
              {!combinedOndriyum.length && (
                <div className="empty">No ondriyum records yet.</div>
              )}
            </div>
            </div>
          </div>


        <div className="missing">
          <h4>Booths Missing Ondriyum Data ({missingOndriyumBooths.length})</h4>
          <div className="chip-list">
            {missingOndriyumBooths.length ? (
              missingOndriyumBooths.map((booth) => (
                <span
                  className="chip"
                  key={`ond-miss-${booth}`}
                  style={{ background: boothColor(booth) }}
                >
                  {booth}
                </span>
              ))
            ) : (
              <div className="empty">All booths have ondriyum data.</div>
            )}
          </div>
        </div>
        </section>
      )}

      <footer className="footer">
        <div>
          <h4>Deployment Ready</h4>
          <p>
            Hook it to your published Google Sheets CSV URL and deploy to any
            cloud portal with `npm run build`.
          </p>
        </div>
        <div className="legend">
          <span className="legend-dot" /> Live sync every refresh
        </div>
      </footer>
    </div>
  )
}
