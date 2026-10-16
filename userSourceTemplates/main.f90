program main
    implicit none
    integer, parameter :: reading_count = 3
    character(len=16) :: reading_labels(reading_count)
    integer :: reading_amounts(reading_count)
    integer :: reading_index
    integer :: total
    character(len=64) :: requested_text
    real :: requested_value

    print '(A)', 'WASMVerse Fortran showcase'
    print '(A)', 'Stage one: arrays and intrinsics'
    reading_labels = [character(len=16) :: 'alpha', 'beta', 'gamma']
    reading_amounts = [7, 12, 21]
    do reading_index = 1, reading_count
        print '(A,I0)', '  ' // trim(reading_labels(reading_index)) // ' holds ', &
            reading_amounts(reading_index)
    end do
    total = sum(reading_amounts)
    print '(A,I0)', '  total: ', total
    print '(A,I0)', '  max minus min: ', maxval(reading_amounts) - minval(reading_amounts)
    print '(A)', 'Stage two: computed sequence'
    do reading_index = 1, 6
        print '(A,I0,A,I0)', '  square ', reading_index, ' = ', reading_index ** 2
    end do
    print '(A)', 'Stage three: interactive scaling'
    print '(A)', 'Enter a number to triple: '
    read '("(A)")', requested_text
    if (len_trim(requested_text) == 0) then
        requested_text = '7'
        print '(A)', 'Using the default input.'
    end if
    read (requested_text, *) requested_value
    print '(A,F0.2)', '  tripled: ', requested_value * 3.0
    print '(A)', 'Showcase complete.'
end program main
