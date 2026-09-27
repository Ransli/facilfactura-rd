// DÓNDE VA: backend/tests/contabilidad/
// Pruebas de integración de los gastos. Se escriben ANTES de completar cada ruta (rojo → verde).
// Cuando `tenancy` esté publicada, `tests/helpers/` tendrá un helper para crear dos empresas; úsalo para la
// prueba de aislamiento (la empresa B no ve ni toca los gastos de A).
import { test } from 'node:test'

test.todo('un facturador registra un gasto y queda asociado a su empresa')
test.todo('no permite registrar dos veces el mismo NCF del mismo proveedor en la misma empresa')
test.todo('rechaza montos negativos, NCF con formato inválido y fechas inexistentes')
test.todo('un visor puede listar gastos pero no crearlos ni editarlos (403)')
test.todo('AISLAMIENTO: la empresa B no ve los gastos de la empresa A en el listado')
test.todo('AISLAMIENTO: la empresa B recibe 404 al pedir, editar o anular un gasto de la empresa A')
test.todo('el 606 de un período incluye solo los gastos registrados de esa empresa y ese mes')
test.todo('el 606 excluye los gastos anulados')
