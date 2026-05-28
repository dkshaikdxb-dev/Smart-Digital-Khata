'use client';

export default function Pagination({ page, totalPages, onNext, onPrev }) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginTop: '20px'
      }}
    >
      <button onClick={onPrev} disabled={page === 1}>
        Previous
      </button>

      <span>
        Page {page} of {totalPages}
      </span>

      <button onClick={onNext} disabled={page === totalPages}>
        Next
      </button>
    </div>
  );
}
