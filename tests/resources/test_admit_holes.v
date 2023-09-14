Theorem test : forall (A : Type) (P : A -> Prop) (x : A), P x -> P x.
Proof.
    intros A P x H.
    admit.
Admitted.

Theorem test2nat : forall n : nat, n = 0 \/ n <> 0.
Proof.
  intros n.
  destruct n.
  - admit.
  - auto.
Admitted. 