/* ============================================================
   app.js — Shared front-end utilities
   ============================================================ */

const Util = {
    qs(name) {
        const params = new URLSearchParams(window.location.search);
        return params.get(name);
    },
    qsAll(name) {
        const params = new URLSearchParams(window.location.search);
        return params.getAll(name);
    },
    money(n) {
        const num = Number(n) || 0;
        return num.toFixed(2);
    },
    escapeHtml(str) {
        if (str === null || str === undefined) return "";
        return String(str)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    },
    formatDate(dateStr) {
        if (!dateStr) return "";
        const d = new Date(dateStr);
        if (isNaN(d)) return dateStr;
        return d.toLocaleDateString("en-IN", { year: "numeric", month: "short", day: "2-digit" });
    }
};

/* ---------------- Navbar injection (replaces navbar.jsp include) ---------------- */
function renderNavbar() {
    const placeholder = document.getElementById("navbar-placeholder");
    if (!placeholder) return;

    placeholder.innerHTML = `
    <div class="navbar">
        <div class="title">Shree Krushna Agencies</div>
        <div class="nav-links">
            <a href="index.html">Home</a>
            <a href="add_worker.html">Add Worker</a>
            <a href="add_job.html">Add Job</a>
            <a href="view_job.html">Search Jobs</a>
            <a href="calculate.html">Summary</a>
        </div>
    </div>`;
}

document.addEventListener("DOMContentLoaded", renderNavbar);
