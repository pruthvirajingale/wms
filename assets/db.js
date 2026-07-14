/* ============================================================
   db.js — Client-side "database" layer (replaces db.jsp / JDBC)
   Uses localStorage to persist Workers, Jobs, and Job Advances.
   ============================================================ */

const DB = (() => {
    const KEYS = {
        workers: "wpm_workers",
        jobs: "wpm_jobs",
        advances: "wpm_advances",
        counters: "wpm_counters"
    };

    function _read(key, fallback) {
        try {
            const raw = localStorage.getItem(key);
            return raw ? JSON.parse(raw) : fallback;
        } catch (e) {
            console.error("DB read error:", e);
            return fallback;
        }
    }

    function _write(key, value) {
        localStorage.setItem(key, JSON.stringify(value));
    }

    function _nextId(counterName) {
        const counters = _read(KEYS.counters, {});
        const next = (counters[counterName] || 0) + 1;
        counters[counterName] = next;
        _write(KEYS.counters, counters);
        return next;
    }

    // Seed with empty structures if not present
    function init() {
        if (localStorage.getItem(KEYS.workers) === null) _write(KEYS.workers, []);
        if (localStorage.getItem(KEYS.jobs) === null) _write(KEYS.jobs, []);
        if (localStorage.getItem(KEYS.advances) === null) _write(KEYS.advances, []);
        if (localStorage.getItem(KEYS.counters) === null) _write(KEYS.counters, {});
    }
    init();

    /* ---------------- Workers ---------------- */
    const Workers = {
        all() {
            return _read(KEYS.workers, []).sort((a, b) => b.id - a.id);
        },
        get(id) {
            return _read(KEYS.workers, []).find(w => w.id === Number(id)) || null;
        },
        add(name, contact, address) {
            const workers = _read(KEYS.workers, []);
            const worker = {
                id: _nextId("workers"),
                name: name.trim(),
                contact: contact.trim(),
                address: (address || "").trim()
            };
            workers.push(worker);
            _write(KEYS.workers, workers);
            return worker;
        },
        update(id, name, contact, address) {
            const workers = _read(KEYS.workers, []);
            const idx = workers.findIndex(w => w.id === Number(id));
            if (idx === -1) return false;
            workers[idx].name = name;
            workers[idx].contact = contact;
            workers[idx].address = address;
            _write(KEYS.workers, workers);
            return true;
        },
        delete(id) {
            let workers = _read(KEYS.workers, []);
            const before = workers.length;
            workers = workers.filter(w => w.id !== Number(id));
            _write(KEYS.workers, workers);

            // Cascade delete jobs (and their advances) for this worker
            let jobs = _read(KEYS.jobs, []);
            const jobIdsToRemove = jobs.filter(j => j.worker_id === Number(id)).map(j => j.id);
            jobs = jobs.filter(j => j.worker_id !== Number(id));
            _write(KEYS.jobs, jobs);

            if (jobIdsToRemove.length) {
                let advances = _read(KEYS.advances, []);
                advances = advances.filter(a => !jobIdsToRemove.includes(a.job_id));
                _write(KEYS.advances, advances);
            }

            return workers.length < before;
        }
    };

    /* ---------------- Rate logic ---------------- */
    const RATES = { gsb: 12.0, nonlight: 3.0, inshop: 6.0 };
    function rateFor(rateType) {
        return RATES[rateType] || 0;
    }

    /* ---------------- Jobs ---------------- */
    const Jobs = {
        all() {
            return _read(KEYS.jobs, []).sort((a, b) => b.id - a.id);
        },
        get(id) {
            return _read(KEYS.jobs, []).find(j => j.id === Number(id)) || null;
        },
        byWorker(workerId) {
            return _read(KEYS.jobs, [])
                .filter(j => j.worker_id === Number(workerId))
                .sort((a, b) => b.id - a.id);
        },
        add({ worker_id, sqft, rate_type, advance, paid, route }) {
            const jobs = _read(KEYS.jobs, []);
            const rate = rateFor(rate_type);
            const total = sqft * rate;
            const remaining = total - (advance + paid);
            const job = {
                id: _nextId("jobs"),
                worker_id: Number(worker_id),
                sqft: Number(sqft),
                rate_type,
                rate,
                advance: Number(advance) || 0,
                paid: Number(paid) || 0,
                total,
                remaining,
                days: 0,
                route: route || ""
            };
            jobs.push(job);
            _write(KEYS.jobs, jobs);
            return job;
        },
        update(id, { sqft, rate_type, advance, paid, days, route }) {
            const jobs = _read(KEYS.jobs, []);
            const idx = jobs.findIndex(j => j.id === Number(id));
            if (idx === -1) return null;
            const rate = rateFor(rate_type);
            const total = sqft * rate;
            const remaining = total - (advance + paid);
            jobs[idx] = {
                ...jobs[idx],
                sqft: Number(sqft),
                rate_type,
                rate,
                total,
                advance: Number(advance),
                paid: Number(paid),
                remaining,
                days: Number(days),
                route
            };
            _write(KEYS.jobs, jobs);
            return jobs[idx];
        },
        delete(id) {
            let jobs = _read(KEYS.jobs, []);
            const before = jobs.length;
            jobs = jobs.filter(j => j.id !== Number(id));
            _write(KEYS.jobs, jobs);

            let advances = _read(KEYS.advances, []);
            advances = advances.filter(a => a.job_id !== Number(id));
            _write(KEYS.advances, advances);

            return jobs.length < before;
        },
        deductRemaining(id, cutAmount) {
            const jobs = _read(KEYS.jobs, []);
            const idx = jobs.findIndex(j => j.id === Number(id));
            if (idx === -1) return null;
            jobs[idx].remaining = jobs[idx].remaining - Number(cutAmount);
            _write(KEYS.jobs, jobs);
            return jobs[idx];
        },
        setPaid(id, amount) {
            const jobs = _read(KEYS.jobs, []);
            const idx = jobs.findIndex(j => j.id === Number(id));
            if (idx === -1) return null;
            jobs[idx].paid = Number(amount);
            jobs[idx].remaining = jobs[idx].total - (jobs[idx].advance + jobs[idx].paid);
            _write(KEYS.jobs, jobs);
            return jobs[idx];
        },
        recalcAdvance(id) {
            // Recompute job.advance from sum of job_advances, then remaining
            const jobs = _read(KEYS.jobs, []);
            const idx = jobs.findIndex(j => j.id === Number(id));
            if (idx === -1) return null;
            const totalAdvance = Advances.sumForJob(id);
            jobs[idx].advance = totalAdvance;
            jobs[idx].remaining = jobs[idx].total - (totalAdvance + jobs[idx].paid);
            _write(KEYS.jobs, jobs);
            return jobs[idx];
        },
        summary() {
            const jobs = _read(KEYS.jobs, []);
            return jobs.reduce((acc, j) => {
                acc.totalJobs += 1;
                acc.totalSqft += j.sqft;
                acc.totalAmount += j.total;
                acc.totalAdvance += j.advance;
                acc.totalPaid += j.paid;
                acc.totalRemaining += j.remaining;
                return acc;
            }, { totalJobs: 0, totalSqft: 0, totalAmount: 0, totalAdvance: 0, totalPaid: 0, totalRemaining: 0 });
        }
    };

    /* ---------------- Job Advances (history) ---------------- */
    const Advances = {
        forJob(jobId) {
            return _read(KEYS.advances, [])
                .filter(a => a.job_id === Number(jobId))
                .sort((a, b) => new Date(b.date_given) - new Date(a.date_given));
        },
        sumForJob(jobId) {
            return this.forJob(jobId).reduce((sum, a) => sum + a.amount, 0);
        },
        add(jobId, amount) {
            const advances = _read(KEYS.advances, []);
            const entry = {
                id: _nextId("advances"),
                job_id: Number(jobId),
                amount: Number(amount),
                date_given: new Date().toISOString().slice(0, 10)
            };
            advances.push(entry);
            _write(KEYS.advances, advances);
            return entry;
        },
        delete(id) {
            let advances = _read(KEYS.advances, []);
            advances = advances.filter(a => a.id !== Number(id));
            _write(KEYS.advances, advances);
        }
    };

    return { Workers, Jobs, Advances, rateFor };
})();
