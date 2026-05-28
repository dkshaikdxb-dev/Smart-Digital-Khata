'use client';

export default function SearchBar({ placeholder = 'Search...', onChange }) {
  return (
    <input
      type="text"
      placeholder={placeholder}
      onChange={event => onChange(event.target.value)}
      style={{
        width: '100%',
        padding: '14px',
        border: '1px solid #d1d5db',
        borderRadius: '10px',
        marginBottom: '20px'
      }}
    />
  );
}
