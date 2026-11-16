// Contract section 2: single resources are { data }, lists are { data, meta }.

function sendData(res, data, status = 200) {
  res.status(status).json({ data });
}

function sendList(res, items, { page, pageSize, totalItems }) {
  res.json({
    data: items,
    meta: {
      page,
      pageSize,
      totalItems,
      totalPages: Math.ceil(totalItems / pageSize),
    },
  });
}

// Contract section 2: availability and personal data must not be cached.
function noStore(res) {
  res.set('Cache-Control', 'no-store');
}

module.exports = { sendData, sendList, noStore };
