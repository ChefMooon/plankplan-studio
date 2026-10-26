/** Decorative axonometric drawing; all faces share the same three axes. */
export function HomeTableIllustration() {
  return <svg viewBox="0 0 280 190" fill="none" aria-hidden="true" focusable="false">
    <path d="m48 145 118-34 76 30-119 35Z" fill="#0C263B" fillOpacity=".22"/>

    {/* Rear post, then the three visible posts, with a light and shaded face. */}
    <g stroke="#D4AA7C" strokeWidth=".8" strokeLinejoin="round">
      <path d="m161 55 8 3v59l-8-3Z" fill="#80583D"/>
      <path d="m169 58 7-2v59l-7 2Z" fill="#634731"/>
      <path d="m215 78 8 3v59l-8-3Z" fill="#A47750"/>
      <path d="m223 81 7-2v59l-7 2Z" fill="#795339"/>
      <path d="m57 82 8 3v59l-8-3Z" fill="#B18358"/>
      <path d="m65 85 7-2v59l-7 2Z" fill="#835A3C"/>
      <path d="m112 104 8 3v59l-8-3Z" fill="#B18358"/>
      <path d="m120 107 7-2v59l-7 2Z" fill="#835A3C"/>
    </g>

    {/* Recessed apron supports the top and meets the posts. */}
    <path d="m57 77 63 25v16L57 93Z" fill="#9B6C46" stroke="#C99A69" strokeLinejoin="round"/>
    <path d="m120 102 110-31v16l-110 31Z" fill="#7E563B" stroke="#C99A69" strokeLinejoin="round"/>
    <path d="m65 85 47 19m15 3 96-27" stroke="#64452F" strokeOpacity=".6"/>

    {/* Thin solid-wood top, with grain following its long edge. */}
    <g stroke="#E6BF8F" strokeWidth="1.2" strokeLinejoin="round">
      <path d="m45 67 75 30v8L45 75Z" fill="#B98755"/>
      <path d="m120 97 120-34v8l-120 34Z" fill="#9C6D44"/>
      <path d="m45 67 120-34 75 30-120 34Z" fill="#D5AA76"/>
    </g>
    <g stroke="#AE7A49" strokeWidth=".8" strokeLinecap="round" opacity=".5">
      <path d="m60 67 107-30m-92 36 106-30M94 80l106-30m-89 37 107-30"/>
      <path d="m87 65 36-10c13-4 21-4 32-8m-25 30 37-11c12-3 20-7 31-9"/>
    </g>
    <path d="m47 67 73 29 118-33" stroke="#F2D4AD" strokeWidth="1.2" strokeLinejoin="round"/>

    {/* Quiet extension lines and diagonal drafting ticks. */}
    <g stroke="#99C7DD" strokeWidth="1" strokeLinecap="round">
      <path d="m42 58-8-16m131-16-4-12m80 61h18m-29 65h29" opacity=".35"/>
      <path d="m36 47 125-35m-128 31 6 8m119-43 6 8M254 75v65m-4-62 8-6m-8 71 8-6" opacity=".8"/>
      <path d="m45 156 59 24m33-4 99-28" strokeDasharray="2 5" opacity=".3"/>
    </g>
  </svg>;
}
