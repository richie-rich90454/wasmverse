(defparameter *limit* 400)

(defun primep (candidate divisors)
  (cond ((null divisors) t)
        ((= 0 (mod candidate (car divisors))) nil)
        (t (primep candidate (cdr divisors)))))

(defun collect-primes (candidate limit found)
  (cond ((> candidate limit) (reverse found))
        ((primep candidate found)
         (collect-primes (+ candidate 2) limit (cons candidate found)))
        (t (collect-primes (+ candidate 2) limit found))))

(defun sieve (limit)
  (if (< limit 2)
      nil
      (collect-primes 3 limit (list 2))))

(defun take (values count)
  (if (or (= count 0) (null values))
      nil
      (cons (car values) (take (cdr values) (- count 1)))))

(defun sum (values)
  (if (null values)
      0
      (+ (car values) (sum (cdr values)))))

(defun residue-count (values modulus target)
  (if (null values)
      0
      (if (= (mod (car values) modulus) target)
          (+ 1 (residue-count (cdr values) modulus target))
          (residue-count (cdr values) modulus target))))

(format t "WASMVerse Common Lisp showcase~%")
(format t "Stage one: recursive prime sieve~%")
(defparameter *primes* (sieve *limit*))
(format t "prime count up to ~a: ~a~%" *limit* (length *primes*))
(format t "largest prime: ~a~%" (car (reverse *primes*)))
(format t "Stage two: higher-order folding~%")
(defparameter *squares* (mapcar (lambda (value) (* value value)) (take *primes* 10)))
(format t "square heads: ~a~%" *squares*)
(format t "sum of square heads: ~a~%" (sum *squares*))
(format t "reduce sum: ~a~%" (reduce (quote +) *squares*))
(format t "Stage three: residue classes~%")
(format t "residue zero under 7: ~a~%" (residue-count *primes* 7 0))
(format t "residue zero under 5: ~a~%" (residue-count *primes* 5 0))
(format t "Showcase complete.~%")
